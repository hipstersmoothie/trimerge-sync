import {
  addInvalidRefsToAckEvent,
  validateCommitOrder,
} from './validateCommits';
import type { AckCommitsEvent, Commit } from 'trimerge-sync';
import { CommitRefs } from './lib/Commits';

function simpleCommit(args: CommitRefs): Commit<unknown, unknown> {
  return {
    ...args,
    metadata: undefined,
  };
}

describe('validateCommitOrder', () => {
  it('validates no commits', () => {
    expect(validateCommitOrder([])).toMatchInlineSnapshot(`
      Object {
        "invalidRefs": Set {},
        "newCommits": Array [],
        "referencedCommits": Set {},
      }
    `);
  });

  it('validates single root commit', () => {
    expect(validateCommitOrder([simpleCommit({ ref: '1' })]))
      .toMatchInlineSnapshot(`
      Object {
        "invalidRefs": Set {},
        "newCommits": Array [
          Object {
            "metadata": undefined,
            "ref": "1",
          },
        ],
        "referencedCommits": Set {},
      }
    `);
  });

  it('validates simple chain', () => {
    expect(
      validateCommitOrder([
        simpleCommit({ ref: '1' }),
        simpleCommit({ ref: '2', baseRef: '1' }),
        simpleCommit({ ref: '3', baseRef: '2' }),
      ]),
    ).toMatchInlineSnapshot(`
      Object {
        "invalidRefs": Set {},
        "newCommits": Array [
          Object {
            "metadata": undefined,
            "ref": "1",
          },
          Object {
            "baseRef": "1",
            "metadata": undefined,
            "ref": "2",
          },
          Object {
            "baseRef": "2",
            "metadata": undefined,
            "ref": "3",
          },
        ],
        "referencedCommits": Set {},
      }
    `);
  });

  it('validates partial chain', () => {
    expect(
      validateCommitOrder([
        simpleCommit({ ref: '2', baseRef: '1' }),
        simpleCommit({ ref: '3', baseRef: '2' }),
      ]),
    ).toMatchInlineSnapshot(`
      Object {
        "invalidRefs": Set {},
        "newCommits": Array [
          Object {
            "baseRef": "1",
            "metadata": undefined,
            "ref": "2",
          },
          Object {
            "baseRef": "2",
            "metadata": undefined,
            "ref": "3",
          },
        ],
        "referencedCommits": Set {
          "1",
        },
      }
    `);
  });

  it('validates merge chain', () => {
    expect(
      validateCommitOrder([
        simpleCommit({ ref: '1' }),
        simpleCommit({ ref: '2', baseRef: '1' }),
        simpleCommit({ ref: '3', baseRef: '1' }),
        simpleCommit({
          ref: '4',
          baseRef: '2',
          mergeRef: '3',
        }),
      ]),
    ).toMatchInlineSnapshot(`
      Object {
        "invalidRefs": Set {},
        "newCommits": Array [
          Object {
            "metadata": undefined,
            "ref": "1",
          },
          Object {
            "baseRef": "1",
            "metadata": undefined,
            "ref": "2",
          },
          Object {
            "baseRef": "1",
            "metadata": undefined,
            "ref": "3",
          },
          Object {
            "baseRef": "2",
            "mergeRef": "3",
            "metadata": undefined,
            "ref": "4",
          },
        ],
        "referencedCommits": Set {},
      }
    `);
  });

  it('validates partial merge chain', () => {
    expect(
      validateCommitOrder([
        simpleCommit({ ref: '3', baseRef: '1' }),
        simpleCommit({
          ref: '4',
          baseRef: '2',
          mergeRef: '3',
        }),
      ]),
    ).toMatchInlineSnapshot(`
      Object {
        "invalidRefs": Set {},
        "newCommits": Array [
          Object {
            "baseRef": "1",
            "metadata": undefined,
            "ref": "3",
          },
          Object {
            "baseRef": "2",
            "mergeRef": "3",
            "metadata": undefined,
            "ref": "4",
          },
        ],
        "referencedCommits": Set {
          "1",
          "2",
        },
      }
    `);
  });

  it('throws for backwards simple chain', () => {
    expect(() =>
      validateCommitOrder([
        simpleCommit({ ref: '2', baseRef: '1' }),
        simpleCommit({ ref: '1' }),
      ]),
    ).toMatchInlineSnapshot(`[Function]`);
  });

  it('throws for backwards simple chain 2', () => {
    expect(() =>
      validateCommitOrder([
        simpleCommit({ ref: '1' }),
        simpleCommit({ ref: '3', baseRef: '2' }),
        simpleCommit({ ref: '2', baseRef: '1' }),
      ]),
    ).toMatchInlineSnapshot(`[Function]`);
  });
});

describe('addInvalidRefsToAckEvent', () => {
  it('adds no commits', () => {
    const ack: AckCommitsEvent = { type: 'ack', syncId: '', acks: [] };
    expect(addInvalidRefsToAckEvent(ack, new Set())).toBe(ack);
  });
  it('adds 1 commit', () => {
    const ack: AckCommitsEvent = { type: 'ack', syncId: '', acks: [] };
    expect(addInvalidRefsToAckEvent(ack, new Set(['hi'])))
      .toMatchInlineSnapshot(`
      Object {
        "acks": Array [],
        "refErrors": Object {
          "hi": Object {
            "code": "unknown-ref",
          },
        },
        "syncId": "",
        "type": "ack",
      }
    `);
  });
  it('adds 2 commits', () => {
    const ack: AckCommitsEvent = {
      type: 'ack',
      syncId: '',
      acks: [],
      refErrors: { yo: { code: 'internal' } },
    };
    expect(addInvalidRefsToAckEvent(ack, new Set(['hi', 'there'])))
      .toMatchInlineSnapshot(`
      Object {
        "acks": Array [],
        "refErrors": Object {
          "hi": Object {
            "code": "unknown-ref",
          },
          "there": Object {
            "code": "unknown-ref",
          },
          "yo": Object {
            "code": "internal",
          },
        },
        "syncId": "",
        "type": "ack",
      }
    `);
  });
  it('does not overwrite commit', () => {
    const ack: AckCommitsEvent = {
      type: 'ack',
      syncId: '',
      acks: [],
      refErrors: { hi: { code: 'internal' } },
    };
    expect(addInvalidRefsToAckEvent(ack, new Set(['hi']))).toEqual(ack);
  });
});
