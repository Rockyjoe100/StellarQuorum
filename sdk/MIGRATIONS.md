# @quorum/sdk migration notes

Breaking changes in `@quorum/sdk`, with the before and after code for each.

Before 1.0, a MINOR release may contain breaking changes
([versioning policy](../docs/publishing.md)). Every breaking change gets an entry
here, under the version that ships it. The process for contributors is in
[CONTRIBUTING.md](../CONTRIBUTING.md#contributing-to-the-sdk).

## 0.2.0

### `buildFinalize` and `buildExecute` take the fee-paying account first

Both builders now take the account that pays the fee as their first argument.

```typescript
// 0.1.x
const finalizeXdr = await client.buildFinalize(proposalId);
const executeXdr = await client.buildExecute(proposalId);

// 0.2.0
const finalizeXdr = await client.buildFinalize(sourceAddress, proposalId);
const executeXdr = await client.buildExecute(sourceAddress, proposalId);
```

**Why:** `finalize()` takes no signer in the contract, so anyone may call it and
the fee payer has to be explicit. `execute()` requires the executor's
authorization, so `buildExecute` uses the same account as executor and fee payer.

**Mechanical update.** [`scripts/codemod-fee-source.mjs`](scripts/codemod-fee-source.mjs)
finds single-argument calls and inserts a `FEE_SOURCE` placeholder:

```bash
# Dry run: lists every call site it would change, writes nothing.
node sdk/scripts/codemod-fee-source.mjs src/

# Apply the change.
node sdk/scripts/codemod-fee-source.mjs --write src/
```

After running it, define `FEE_SOURCE` with the account that pays the fee, or
replace the placeholder at each call site. TypeScript reports the placeholder as
an undefined name until you do.

---

## Writing an entry

When a PR changes or removes a public SDK signature, add a section under the
version that will ship it:

1. A heading that names the change.
2. A `before` and an `after` code block.
3. One or two sentences on why the change was made.
4. The codemod command, when the change is mechanical.
