import {
  AbstractLocalStore,
  SyncEvent,
  DiffNode,
  GetLocalStoreFn,
  GetRemoteFn,
  NodesEvent,
  OnEventFn,
} from 'trimerge-sync';
import { DBSchema, IDBPDatabase, openDB, StoreValue } from 'idb';
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from 'broadcast-channel';

function getSyncCounter(
  nodes: StoreValue<TrimergeSyncDbSchema, 'nodes'>[],
): number {
  let syncCounter = 0;
  for (const node of nodes) {
    if (syncCounter < node.syncId) {
      syncCounter = node.syncId;
    }
  }
  return syncCounter;
}

function toSyncId(syncNumber: number): string {
  return syncNumber.toString(36);
}
function toSyncNumber(syncId: string | undefined): number {
  return syncId === undefined ? 0 : parseInt(syncId, 36);
}

export function createIndexedDbBackendFactory<
  EditMetadata,
  Delta,
  PresenceState
>(
  docId: string,
  getRemote?: GetRemoteFn<EditMetadata, Delta, PresenceState>,
): GetLocalStoreFn<EditMetadata, Delta, PresenceState> {
  return (userId, clientId, onEvent) =>
    new IndexedDbBackend(docId, userId, clientId, onEvent, getRemote);
}

class IndexedDbBackend<
  EditMetadata,
  Delta,
  PresenceState
> extends AbstractLocalStore<EditMetadata, Delta, PresenceState> {
  private readonly dbName: string;
  private db: Promise<IDBPDatabase<TrimergeSyncDbSchema>>;
  private readonly channel: BroadcastChannel<
    SyncEvent<EditMetadata, Delta, PresenceState>
  >;
  private readonly leaderElector: LeaderElector | undefined;

  public constructor(
    private readonly docId: string,
    userId: string,
    clientId: string,
    onEvent: OnEventFn<EditMetadata, Delta, PresenceState>,
    getRemote?: GetRemoteFn<EditMetadata, Delta, PresenceState>,
  ) {
    super(userId, clientId, onEvent);
    const dbName = `trimerge-sync:${docId}`;
    console.log(`[TRIMERGE-SYNC] new IndexedDbBackend(${dbName})`);
    this.dbName = dbName;
    this.db = this.connect();
    this.channel = new BroadcastChannel(dbName, { webWorkerSupport: false });
    this.channel.addEventListener('message', this.onLocalBroadcastEvent);
    if (getRemote) {
      this.leaderElector = createLeaderElection(this.channel);
      this.leaderElector
        .awaitLeadership()
        .then(() => this.connectRemote(getRemote))
        .catch(this.handleAsError('internal'));
    }
    this.sendInitialEvents().catch(this.handleAsError('internal'));
    window.addEventListener('beforeunload', this.shutdown);
  }

  protected broadcastLocal(
    event: SyncEvent<EditMetadata, Delta, PresenceState>,
  ): Promise<void> {
    return this.channel.postMessage(event).catch(this.handleAsError('network'));
  }

  protected getNodesForRemote(): AsyncIterableIterator<
    NodesEvent<EditMetadata, Delta, PresenceState>
  > {
    // FIXME: getNodesForRemote on IndexedDbBackend
    throw new Error('unimplemented');
  }

  protected async acknowledgeRemoteNodes(
    refs: readonly string[],
    remoteSyncId: string,
  ): Promise<void> {
    // FIXME: acknowledgeRemoteNodes on IndexedDbBackend
    throw new Error('unimplemented');
  }

  protected async getLastRemoteSyncId(): Promise<string | undefined> {
    // FIXME: getLastRemoteSyncId on IndexedDbBackend
    throw new Error('unimplemented');
  }

  private async connect(
    reconnect: boolean = false,
  ): Promise<IDBPDatabase<TrimergeSyncDbSchema>> {
    if (reconnect) {
      console.log(
        '[TRIMERGE-SYNC] IndexedDbBackend: reconnecting after 3 second timeout…',
      );
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    const db = await createIndexedDb(this.dbName);
    db.onclose = () => {
      this.db = this.connect(true);
    };
    return db;
  }

  protected async addNodes(
    nodes: DiffNode<EditMetadata, Delta>[],
  ): Promise<string> {
    const db = await this.db;
    const tx = db.transaction(['heads', 'nodes'], 'readwrite');

    const headsDb = tx.objectStore('heads');
    const nodesDb = tx.objectStore('nodes');

    const [currentHeads, syncIdCursor] = await Promise.all([
      headsDb.getAllKeys(),
      // Gets the last item in the nodes db based on the syncId index
      nodesDb.index('syncId').openCursor(undefined, 'prev'),
    ]);
    let syncCounter = syncIdCursor?.value.syncId ?? 0;

    const priorHeads = new Set(currentHeads);
    const headsToDelete = new Set<string>();
    const headsToAdd = new Set<string>();
    const promises: Promise<unknown>[] = [];
    for (const node of nodes) {
      syncCounter++;
      promises.push(nodesDb.add({ syncId: syncCounter, ...node }));
      const { ref, baseRef, mergeRef } = node;
      if (baseRef !== undefined) {
        headsToDelete.add(baseRef);
      }
      if (mergeRef !== undefined) {
        headsToDelete.add(mergeRef);
      }
      headsToAdd.add(ref);
    }
    for (const ref of headsToDelete) {
      headsToAdd.delete(ref);
      if (priorHeads.has(ref)) {
        promises.push(headsDb.delete(ref));
      }
    }
    for (const ref of headsToAdd) {
      promises.push(headsDb.add({ ref }));
    }
    if (promises.length > 0) {
      await Promise.all(promises);
      await tx.done;
    }

    return toSyncId(syncCounter);
  }

  protected async *getLocalNodes(): AsyncIterableIterator<
    NodesEvent<EditMetadata, Delta, PresenceState>
  > {
    const lastSyncCounter = toSyncNumber(undefined);
    const db = await this.db;
    const nodes = await db.getAllFromIndex(
      'nodes',
      'syncId',
      IDBKeyRange.lowerBound(lastSyncCounter, true),
    );
    const syncCounter = getSyncCounter(nodes);
    yield {
      type: 'nodes',
      nodes,
      syncId: toSyncId(syncCounter),
    };
  }

  shutdown = async (): Promise<void> => {
    await super.shutdown();
    window.removeEventListener('beforeunload', this.shutdown);
    await this.leaderElector?.die();
    await this.channel.close();

    const db = await this.db;
    // To prevent reconnect
    db.onclose = null;
    db.close();
  };
}

interface TrimergeSyncDbSchema extends DBSchema {
  heads: {
    key: string;
    value: {
      ref: string;
    };
  };
  nodes: {
    key: string;
    value: { syncId: number } & DiffNode<any, any>;
    indexes: {
      syncId: number;
    };
  };
}

function createIndexedDb(
  dbName: string,
): Promise<IDBPDatabase<TrimergeSyncDbSchema>> {
  return openDB<TrimergeSyncDbSchema>(dbName, 1, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('heads', { keyPath: 'ref' });
        const nodes = db.createObjectStore('nodes', {
          keyPath: 'ref',
        });
        nodes.createIndex('syncId', 'syncId');
      }
    },
  });
}
