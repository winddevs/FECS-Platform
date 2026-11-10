---
name: archify
description: Author typed JSON diagram specs (architecture, workflow, sequence, dataflow, lifecycle) that CI renders into interactive HTML. Load when a task involves visualising service topology, API flows, data pipelines, state machines, approval processes, or producing an architecture delta for a PR review.
version: 2.17.0
source: https://github.com/tt-a1i/archify
triggers:
  - architecture diagram
  - system diagram
  - workflow diagram
  - sequence diagram
  - data flow diagram
  - state machine diagram
  - service map
  - ADR diagram
  - PR architecture review
  - infrastructure map
  - onboarding diagram
  - visualise system
  - draw diagram
  - before/after diagram
---

# Archify — AI Team

Your job is to write a correct, validated archify JSON spec and commit it alongside the code change. CI renders it to HTML automatically — you do not run `node` in the container.

## Workflow

```
Agent writes JSON spec → commits to repo → CI job renders → HTML attached to MR
```

The JSON spec is the durable artefact. It is version-controlled, diffable, and re-renderable. The HTML is a derived output produced by the `archify-render` CI job (see `.gitlab-ci.yml`).

## When to load this skill

| Trigger                                                            | Diagram type                        |
| ------------------------------------------------------------------ | ----------------------------------- |
| PR touches service boundaries, API contracts, or DB schema         | `architecture` — Before/After delta |
| Task decomposes into more than 3 cross-service interactions        | `architecture`                      |
| Documenting an API call chain, cache fallback, or async trace      | `sequence`                          |
| Documenting a multi-step approval flow, CI/CD pipeline, or runbook | `workflow`                          |
| Documenting data pipeline steps, lineage, or PII boundaries        | `dataflow`                          |
| Documenting job/order/issue state transitions and retries          | `lifecycle`                         |

## Type router

| Type           | Best for                                                              |
| -------------- | --------------------------------------------------------------------- |
| `architecture` | Services, databases, message buses, trust boundaries, cloud topology  |
| `workflow`     | Approval gates, CI/CD steps, agent orchestration, multi-step runbooks |
| `sequence`     | API call chains, auth flows, request lifecycles, async traces         |
| `dataflow`     | ETL/ELT, Kafka pipelines, data lineage, PII sensitivity               |
| `lifecycle`    | Status/state transitions, retries, cancellation, terminal outcomes    |

## JSON authoring procedure

1. **Choose the type** from the table above. When ambiguous, prefer `architecture` for static topology, `sequence` for temporal interaction.

2. **Start from the schema + one example.** Read `archify/schemas/<type>.schema.json` and one matching file from `archify/examples/`. Use the example for field shapes — never copy its facts.

3. **Draft the spec.** Follow these constraints:
   - `meta.quality_profile: "showcase"` (default — omit only if explicitly asked for `standard`)
   - At most **12 primary nodes** on the first pass
   - One clear **main path** through the diagram; side branches leave from the nearest main-path node
   - Stable, domain-meaningful **IDs** (`user-service`, `order-db`, not `node1`, `n2`)
   - Omit `via`, `channelX`, `channelY`, `labelAt` unless a validation diagnostic calls for one
   - Omit `meta.subtitle` unless explicitly requested
   - Omit `meta.visual_preset` (opens in `classic` by default)
   - Relationship labels are semantic data — never delete a label to fix geometry

4. **Name the file** using the convention `<scope>.<type>.archify.json`, e.g.:
   - `payment-service.architecture.archify.json`
   - `checkout-flow.sequence.archify.json`
   - `order-lifecycle.lifecycle.archify.json`

   Place it in the relevant directory alongside the code it describes — typically `docs/diagrams/` at the repo root, or next to the `CONTEXT.md` it supplements.

5. **Validate the spec before committing** (local dev — not inside the container):

   ```bash
   # Run on your local machine or in a CI-like environment with Node.js
   npx -y skills use tt-a1i/archify@archify --agent codex
   node bin/archify.mjs validate <type> <file>.archify.json --quality showcase --json
   ```

   A showcase pass reports **all 9 artifact checks, 0 composition errors, 0 warnings.**
   If it fails, apply only the `supportedFixes` for each `diagnostics[]` subject.

6. **Commit the JSON spec.** The CI `archify-render` job picks it up, renders HTML, and attaches it as a pipeline artifact accessible from the MR.

   If the repo does not yet have the `archify-render` CI job, add it once to `.gitlab-ci.yml`:

   ```yaml
   include:
     - project: "btaskee/btaskee-ops/harness"
       ref: main
       file: "agent-core/templates/archify-render.gitlab-ci.yml"
   ```

## Architecture delta (Before/After for PR review)

When a PR changes service boundaries, produce two specs:

- `<scope>.before.architecture.archify.json` — current state
- `<scope>.after.architecture.archify.json` — post-PR state

Commit both. CI renders a delta comparing them. Include the MR artifact link in your handoff comment.

## Authoring invariants (from upstream SKILL.md)

- Component types: `frontend`, `backend`, `database`, `cloud`, `security`, `messagebus`, `external`
- Variants: `default`, `emphasis`, `security`, `dashed`
- Automatic routes own their endpoint sides — do not set `via` before a diagnostic calls for it
- Spacing means clear gap, not center distance
- Never accept an edge crossing an unrelated opaque node
- Brand identity is optional and explicit — use a built-in ID only when the node names that real product

## Handoff comment format

Include this block in your Multica handoff comment so tech-lead knows where to find the spec:

```
### Architecture diagram
- spec: docs/diagrams/<file>.archify.json
- type: <architecture|workflow|sequence|dataflow|lifecycle>
- renders to: MR artifact `archify/<file>.html` (produced by CI)
- coverage: <what this diagram shows — 1 sentence>
```

## Local render reference (not for agent execution in container)

If you need to render locally for a quick preview on your development machine:

```bash
npx skills add tt-a1i/archify -g          # one-time install
node bin/archify.mjs doctor               # verify
node bin/archify.mjs deliver <type> <file>.archify.json output.html --quality showcase --open
```
