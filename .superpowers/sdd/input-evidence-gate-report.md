# Input Evidence Gate Report

## Outcome

Implemented a fail-closed input evidence gate for the Electron chat bridge. Validation now completes after attachment evidence is built and before response headers are flushed, the user message is persisted, research is invoked, or an engine is spawned/written to.

## Behavior

- Ordinary text is unchanged.
- Reserved `[image]`, `[image #N]`, `[图片]`, and `[图片 #N]` placeholders match only complete non-code lines; fenced, indented, inline, and sentence-embedded forms are ignored.
- Every non-GitHub structured attachment requires one `kind=attachment,status=available` evidence entry.
- Reserved image placeholders additionally require `access=model_image` evidence.
- Unknown semantic states and surplus evidence entries fail closed.
- Failures return stable HTTP 422 JSON before SSE headers are flushed. Error payloads contain only stable codes, generic messages, counts, and reason codes.
- Rejection removes only image blocks captured by this request and only files this request created through the existing `wx` write. Existing files and unrelated pending blocks are retained.

## TDD Evidence

The first focused run failed all six tests because the validator and bridge gate were absent. Subsequent RED cases demonstrated that indented Markdown code and mismatched nested fence markers could bypass the initial matcher, and that semantically inconsistent attachment access was initially accepted. Minimal changes made each case GREEN.

## Verification

- `node --test electron/test/input-evidence-gate.test.cjs electron/test/evidence-ledger.test.cjs`: 27 passed.
- `npm test`: 10 files, 68 tests passed.
- `npm run test:electron`: 95 tests passed.
- `npm run build`: passed (existing Vite chunk-size/dynamic-import warnings only).
- `node --check electron/input-evidence-gate.cjs`: passed.
- `node --check electron/bridge-server.cjs`: passed.
- `git diff --check`: required again immediately before commit.

## Review Notes

- The validator is a pure CommonJS module and returns frozen results.
- GitHub virtual attachments remain governed by the existing GitHub workspace evidence and are excluded from physical attachment cardinality.
- Reasoning collection and presentation paths were not changed.
- No real database, uploaded attachment, credential, Electron runtime, or Bun runtime was accessed or started.

## Needs-fixes Follow-up

- Model/provider changes are staged without mutating the conversation before the gate. A 422 response performs no database mutation or save.
- Attachment evidence now carries the original non-negative `attachment_index`. The validator requires exactly one available entry for every physical structured attachment, rejects duplicates/missing/out-of-range indices, and deliberately skips virtual GitHub attachments while retaining their original array positions.
- The bridge now uses a testable request transaction. The normal path is `spawn -> reversible persist -> stdin.write -> commit`; spawn, persistence, or stdin failures restore staged configuration, remove the exact request row, persist the rollback when necessary, and remove only request-owned files/blocks. Research commits when routing begins, so later research failure retains the accepted user request for audit/retry.
- Placeholder mapping supports indices 1-999, rejects zero and four-digit forms, requires numbered indices to exist, allocates distinct images to anonymous placeholders, and permits repeated numbered references to the same image.
- Markdown fence parsing records marker character and opening length, accepts only same-character closing fences of sufficient length with whitespace-only tails, and handles LF, CRLF, and bare CR.
- Runtime transaction tests cover JSON-only 422 behavior, no SSE flush/write, no rejected DB/config mutation, reversible persistence, failed save, pre-gate/spawn/stdin-equivalent rollback phases, concurrent pending-block identity, and existing-file preservation.

### Follow-up Verification

- `npm test`: 10 files, 68 tests passed.
- `npm run test:electron`: 108 tests passed.
- `npm run build`: passed with the same pre-existing Vite chunk warnings.
- Focused tests, four relevant CommonJS syntax checks, and `git diff --check` are rerun immediately before amend.

## Final Review Follow-up

- Engine stdin is awaited through its callback. Synchronous throws, callback errors, and the Writable `error` event reject the request; a `false` write return is treated only as backpressure. The transaction commits only after callback success.
- Research resolves configuration and completes the pipeline before committing. Resolve/run failures roll back, while both success and failure finish only that request's pending images.
- Pending images are keyed by the user-message/request UUID rather than conversation ID. Proxy injection receives the active request ID, and turn success/failure removes only its own collection; interleaved A/B request tests prove isolation and ordered consumption.
- Conversation configuration uses an ownership stack per conversation. Interleaved apply/rollback restores the original configuration, and a committed owner survives another request's failure.
- File unlink is per-item best effort; a non-ENOENT failure cannot prevent later owned files, message rows, configuration, or persisted rollback from being processed.
- The final RED suite used a real Node `Writable` with an asynchronous callback error, request-interleaving image prompts, concurrent configuration transactions, and a filesystem stub that fails the first unlink.

## Concurrency Review Follow-up

- The OpenAI conversion proxy no longer uses a process-global last-writer target. Every persistent engine registers an unguessable `/engine/<route>/v1` path mapped to its own immutable endpoint/credential context and mutable request UUID. Proxy HTTP requests resolve context exclusively from that engine-specific route, so a late A request cannot inherit B's endpoint, credential, images, or request identity.
- Route identifiers contain no credentials and proxy logs continue to include only request IDs, conversation IDs, model names, and structural counts. Engine kill/close/error paths unregister the route.
- Configuration ownership is tracked independently for `model`, `provider_id`, and `credentialProfile`. An external change updates only that field's base, while rollback still restores other owned fields; interleaved committed and failed transactions remain ordered.
- RED coverage includes A/B proxy route interleaving where B updates before A's late HTTP resolution, a bridge assertion forbidding global `proxyTarget`, and separate external mutations of model/provider/profile.
