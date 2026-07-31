# Vendored program IDLs

Published Anchor IDLs vendored from their upstream repositories. The concepts
under `../concepts/generated/` are produced from these files — do not edit the
generated YAML by hand; re-run the regeneration script instead:

```sh
pnpm regen:concepts
```

| File                  | Program                                                                      | Source                                                                                      |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `mpl_core.json`       | Metaplex Core (`CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`)               | <https://github.com/metaplex-foundation/mpl-core> (`idls/mpl_core.json`)                    |
| `candy_machine.json`  | Metaplex Candy Machine Core (`CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR`) | <https://github.com/metaplex-foundation/mpl-candy-machine> (`idls/candy_machine_core.json`) |
| `jito_restaking.json` | Jito Restaking (`RestkWeAVL8fRGgzhfeoqFhsqKRchg6aa1XrcH96z4Q`)               | <https://github.com/jito-foundation/restaking> (`idl/jito_restaking.json`)                  |

Vendored: 2026-07-31. All three are legacy (v0) Anchor IDLs; the CLI's codemod
migrates them to v1 before concept generation.

Curated concepts (e.g. `../concepts/tokens/token-account.yaml`) remain
hand-maintained: native programs have no Anchor IDL, and the curated files
carry offset-addressed fixed layouts and state machines an IDL cannot express.
