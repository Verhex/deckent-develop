# Model activation

Model detection answers what a provider **offers** for the current authentication
mode. Model activation is the owner-managed layer that answers which detected
models the owner **allows** into Deckent's routing pool. It lets an owner keep a
provider's discovered catalog while excluding individual models from routing.

Activation decisions are stored per project in `.deckent/models.db`, keyed by
provider and model ID. A decision is durable until it is changed. Detection still
sees a deactivated model, but it is removed from the routing pool.

## Commands

Show recorded activation decisions:

```bash
deckent models activation
```

When there are no recorded decisions, this command reports that every detected
model is active. This is also the default behavior: a model with no recorded
decision is active, so existing projects retain their current behavior until an
owner records a decision.

Allow a detected model into the routing pool:

```bash
deckent models activate <model> --provider <name>
```

Remove a detected model from the routing pool:

```bash
deckent models deactivate <model> --provider <name>
```

The `--provider <name>` option is required for both changes. Decisions are scoped
to that provider and model pair.

## Example

To keep the detected `gpt-5-mini` model out of routing for the `codex` provider:

```bash
deckent models deactivate gpt-5-mini --provider codex
deckent models activation
```

The first command confirms that `codex/gpt-5-mini` was deactivated. The second
lists it as `inactive`, confirming the recorded decision; the provider can still
detect the model, but routing will not select it.
