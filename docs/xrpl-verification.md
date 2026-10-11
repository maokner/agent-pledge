# XRPL assumption verification

Independent read-only check of the PRD's XRPL design assumptions.
Produced on 2026-10-11 by a GPT-6 Sol worker (Factory Droid) with primary-source citations and live testnet queries.
See README sections 5.1 to 5.4 and 11 for the design these findings apply to.

---

I read README sections 5.1 to 5.4 and 11, checked rippled and the installed xrpl.js 4.7.0 source, and made **read-only** public testnet queries. I did not submit transactions or change files. The live findings are a snapshot, not a completed end-to-end swap test.

## Findings

### 1. Zero-price, open NFT sell offer: **Confirmed**

`NFTokenCreateOffer` with `tfSellNFToken`, `Amount: "0"` (XRP drops), and no `Destination` passes the amount and destination checks. In current rippled, `NFTokenCreateOffer::preflight` delegates to `tokenOfferCreatePreflight`, whose relevant checks are:

```cpp
if (!isXRP(amount))
{
    if ((nftFlags & nft::kFlagOnlyXrp) != 0)
        return temBAD_AMOUNT;

    if (!amount)
        return temBAD_AMOUNT;
}

// If this is an offer to buy, you must offer something; if it's an
// offer to sell, you can ask for nothing.
bool const isSellOffer = (txFlags & tfSellNFToken) != 0u;
if (!isSellOffer && !amount)
    return temBAD_AMOUNT;
```

Thus **zero XRP is allowed only for a sell offer**; zero IOU and zero-price buy offers return `temBAD_AMOUNT`. A negative amount also returns `temBAD_AMOUNT`. An omitted `Destination` does not impose a recipient restriction. This confirms the README's planned free helper claim, subject to ordinary ownership, reserve, and other transaction checks; it does **not** constitute a submitted test transaction. [rippled preflight wrapper](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenCreateOffer.cpp#L25-L46), [shared amount checks](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/ledger/helpers/NFTokenHelpers.cpp#L763-L818), [XRPL offer fields](https://xrpl.org/docs/references/protocol/transactions/types/nftokencreateoffer).

### 2. Issuer burning an NFT held by someone else: **Confirmed**

The current holder can burn its NFT. With `tfBurnable`, the **NFT issuer** can burn it while another account holds it by supplying that holder in `Owner`. The issuer's _currently authorized NFToken minter_ can also do so: rippled compares the submitting account with the issuer account's `sfNFTokenMinter`. It does **not** check whether that account originally minted this particular NFT. Without the burnable flag, an issuer or minter who is not the holder gets `tecNO_PERMISSION`. [rippled burn preclaim](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenBurn.cpp#L24-L54), [NFTokenBurn documentation](https://xrpl.org/docs/references/protocol/transactions/types/nftokenburn).

For Agent Pledge, the vault can therefore burn a claimed helper NFT **without first buying it back**. That is a powerful failure-path control, not a payment to the helper. [rippled burn behavior](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenBurn.cpp#L57-L92).

### 3. Accepting an already-consumed offer: **Confirmed**

Once an accepted offer has been deleted, another `NFTokenAcceptOffer` referencing its index encounters a missing ledger entry and returns **`tecOBJECT_NOT_FOUND`**, not a `tem` code. A `tec` failure can be included in a validated ledger and costs the submitting account its transaction fee. A preliminary submission response is not final: if the second transaction never validates, do not present `tecOBJECT_NOT_FOUND` as its validated result. [rippled missing-offer check](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenAcceptOffer.cpp#L65-L77), [tec code semantics](https://xrpl.org/docs/references/protocol/transactions/transaction-results/tec-codes), [finality](https://xrpl.org/docs/concepts/transactions/finality-of-results).

### 4. RLUSD-denominated NFT sell offers: **Confirmed, with conditions**

- Mint without `tfOnlyXRP`; that flag makes a non-XRP offer amount fail with `temBAD_AMOUNT`. The accepting buyer must be able to pay the RLUSD amount, and the seller, including the vault when it sells an NFT for the agent's pledge, must be able to receive it. For the helper's payout offer, the **helper is the seller and RLUSD recipient**; the vault is the accepting buyer and needs the RLUSD balance. A non-issuer recipient needs an appropriate trust line, and authorization and freeze settings can block a transfer. [offer preflight and preclaim](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/ledger/helpers/NFTokenHelpers.cpp#L787-L800), [offer trust-line checks](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/ledger/helpers/NFTokenHelpers.cpp#L865-L924), [accept-offer funding and recipient checks](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenAcceptOffer.cpp#L230-L295).
- **Separate the two issuers.** The _NFT issuer_ needs a trust line to the _RLUSD issuer_ to collect an IOU-denominated NFT **transfer fee** when that fee is nonzero, unless they are the same account. With `TransferFee` zero, that specific royalty trust-line check does not apply. This does not waive the vault's trust line when the vault itself receives RLUSD as seller. [rippled fee condition](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/ledger/helpers/NFTokenHelpers.cpp#L821-L854).
- Do **not** set mint flag `tfTrustLine` for this design. The enabled `fixRemoveNFTokenAutoTrustLine` amendment disables minting with that old automatic-trust-line flag; it is not a way to supply a missing RLUSD trust line, regardless of a zero `TransferFee`. [rippled mint flag handling](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenMint.cpp#L54-L81).

### 5. Requester-to-vault IOU payments and Default Ripple: **Confirmed, with a qualification**

An IOU payment between two non-issuer accounts routes through the issuer's trust lines. The issuer must permit rippling **on the applicable lines**. `asfDefaultRipple` is the normal issuer setting that makes new lines permit it; it is not an absolute protocol requirement if the needed existing lines have separately been configured to allow rippling. Without a usable path, the payment fails rather than moving RLUSD. Merely giving requester and vault balances and trust lines is not enough if the issuer-side No Ripple settings block that path. [XRPL trust-line and rippling explanation](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens), [AccountSet Default Ripple setting](https://xrpl.org/docs/references/protocol/transactions/types/accountset).

The queried testnet issuer **does have `lsfDefaultRipple` set**: its `Flags` are `2174353408`, or `0x819A0000`, which includes `0x00800000`. [account flag definitions](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/models/ledger/AccountRoot.ts#L181-L190), [public testnet `account_info`](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_info). This checks the issuer setting, not every future requester/vault trust line.

### 6. Testnet RLUSD and a faucet: **Uncertain for supported programmatic acquisition**

The testnet issuer address in the README is live. Its `account_lines` returned currency `524C555344000000000000000000000000000000`, which encodes `RLUSD`, including a nonzero-balance line. The `account_info` response itself identifies the account and flags, **not** its issued currency; `account_lines` supplies that evidence. [public testnet `account_info`](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_info), [`account_lines`](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines).

A public [RLUSD Stablecoin Faucet](https://tryrlusd.com/) advertises "Claim testnet RLUSD" for XRPL. Its current client shows a connect, fund, trust-line, claim flow and a **10 RLUSD** claim. The client calls `/api/mint-xrpl` with a POST containing an address and included credentials, and handles rate-limit errors. That demonstrates a web-app endpoint, **not a documented, stable, permission-free programmatic faucet API**; I did not call its claim endpoint or establish that an unattended script can use it. The site identifies itself as built by a RippleX team, but I did not independently verify operational ownership. [faucet page](https://tryrlusd.com/), [current faucet client bundle](https://tryrlusd.com/_next/static/chunks/app/page-af638f05fea334f2.js). Treat obtaining usable RLUSD as a build prerequisite, as section 11 already does.

### 7. XLS-85 Token Escrow on testnet: **Confirmed**

A read-only testnet `feature` query returned `TokenEscrow: { "enabled": true, "supported": true }`. The queried RLUSD issuer's `Flags` are `0x819A0000`; **`lsfAllowTrustLineLocking`, mask `0x40000000`, is absent**. Consequently, the enabled amendment alone does not make this issuer's RLUSD eligible for native token escrow. This verifies the README's **testnet** conclusion, not its separate mainnet claim, which I did not query. [XLS-85 specification](https://xls.xrpl.org/xls/XLS-0085-token-escrow.html), [account flag definition](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/models/ledger/AccountRoot.ts#L217-L224), [`feature` method](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/feature).

### 8. xrpl.js v4 NFT identifiers: **Confirmed for installed 4.7.0**

For a validated `NFTokenMint` result, use **`xrpl.getNFTokenID(result.meta)`**. The helper accepts decoded metadata or a binary metadata string, looks for the newly added token across created or modified `NFTokenPage` entries, and can return `undefined` if none is found. The installed 4.7.0 mint metadata type also declares `meta.nftoken_id` for rippled 1.11.0 or later. [tagged `getNFTokenID` source](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/utils/getNFTokenID.ts), [mint metadata type](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/models/transactions/NFTokenMint.ts).

For `NFTokenCreateOffer`, find the `AffectedNodes` element whose **`CreatedNode.LedgerEntryType === "NFTokenOffer"`** and take **`CreatedNode.LedgerIndex`**, the ledger object's index. Do not use `NewFields` for the index or use `getNFTokenID` for an offer. On rippled 1.11.0 or later, the installed type also exposes `meta.offer_id` as a direct alternative. The package actually installed here is **xrpl.js 4.7.0**; check these conveniences again if the dependency is changed. [metadata node structure](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/models/transactions/metadata.ts#L24-L33), [offer metadata type](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/models/transactions/NFTokenCreateOffer.ts#L89-L93).

### 9. Reserves: **Confirmed at the queried testnet ledger**

`server_info` reported **1 XRP base reserve** and **0.2 XRP owner reserve increment**. A helper temporarily owning one RLUSD trust line, one NFT page, and one NFT sell offer would need approximately **1.6 XRP reserved**, plus spendable XRP for fees. Thus a wallet actually funded with **100 XRP** has ample reserve margin for that one-task pattern; I did **not** call the faucet to independently verify today's 100 XRP grant. Current NFT-page creation and offer ownership, rather than "one reserve per NFT," determine the actual `OwnerCount`. [XRPL reserves](https://xrpl.org/docs/concepts/accounts/reserves), [NFT reserve requirements](https://xrpl.org/docs/concepts/tokens/nfts/reserve-requirements), [`server_info`](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_info).

The vault needs the 1 XRP base, its RLUSD line reserve, **0.2 XRP per outstanding offer**, reserves for however many NFT pages it actually owns, and fee headroom. Monitor its live `OwnerCount` and balance instead of multiplying the NFT count by a fixed page cost. [XRPL reserves](https://xrpl.org/docs/concepts/accounts/reserves), [NFT reserve requirements](https://xrpl.org/docs/concepts/tokens/nfts/reserve-requirements).

### 10. Competing claims and concurrent autofill: **Confirmed, but "first tap wins" is not guaranteed**

Validated transactions are applied in a **canonical order**. Of two otherwise-valid accepts of the same offer, only the one executed while that offer still exists can succeed; the other cannot acquire the same NFT. The eventual ledger order is deterministic **once the transaction set is settled**, but network arrival or the first button tap does not promise which account wins. The losing transaction's validated result is `tecOBJECT_NOT_FOUND` **if it is included after the winning accept**; a transaction that never validates has no such validated result. [canonical application](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission), [missing-offer check](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenAcceptOffer.cpp#L65-L77), [finality](https://xrpl.org/docs/concepts/transactions/finality-of-results).

For two transactions from **the same account**, xrpl.js 4.7.0 autofill obtains `Sequence` by independently requesting that account's `account_info` at ledger index `current`. Two concurrent autofills can therefore choose the **same sequence**; signing and submitting both does not allocate distinct numbers. Serialize submissions per wallet, or explicitly manage distinct sequences (and validated outcomes or tickets). Set a `LastLedgerSequence` and check validated results before advancing task state. [xrpl.js autofill](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/client/index.ts#L652-L695), [sequence lookup](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/sugar/autofill.ts), [reliable submission](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission).

## Live read-only testnet evidence

Queries used `POST https://s.altnet.rippletest.net:51234` with read-only methods. Values below came from validated-ledger queries on **2026-10-11**; account, feature, and server snapshots were taken across nearby ledger versions, not in one atomic snapshot. [XRPL public API methods](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods).

```text
server_info: build_version = 3.4.1
validated ledger 21462049:
  reserve_base_xrp = 1
  reserve_inc_xrp  = 0.2
  base_fee_xrp     = 0.00001

account_info(rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV):
  Flags = 2174353408 = 0x819A0000
  lsfDefaultRipple (0x00800000)          = set
  lsfAllowTrustLineLocking (0x40000000) = unset
  lsfRequireAuth (0x00040000)           = unset

account_lines(issuer):
  currency = 524C555344000000000000000000000000000000
  example line balance = -1000

feature(TokenEscrow):
  enabled = true
  supported = true

feature(fixRemoveNFTokenAutoTrustLine):
  enabled = true
```

The masks come from the [xrpl.js 4.7.0 AccountRoot flag definitions](https://github.com/XRPLF/xrpl.js/blob/xrpl@4.7.0/packages/xrpl/src/models/ledger/AccountRoot.ts#L160-L224). The issuer account can change its settings, and reserves or amendments can change on later ledgers.

## Design risks to address before building around the flow

1. **This is a custodial vault, not native RLUSD escrow.** The vault holds funds and its server decides when to sign payouts or refunds. NFT acceptance makes _that individual swap_ atomic; it does not make the preceding deposit, PIN decision, failure refund, and both payouts one atomic escrow operation. [README design](file:///Users/mokner/Desktop/agent-pledge/README.md), [NFT acceptance](https://xrpl.org/docs/references/protocol/transactions/types/nftokenacceptoffer), [XLS-85](https://xls.xrpl.org/xls/XLS-0085-token-escrow.html).
2. **Issuer burn can override a holder's NFT claim.** Define and show this rule clearly in the failure flow; a burned NFT is not a ledger-enforced promise of payout. [rippled burn permission and application](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/nft/NFTokenBurn.cpp#L24-L92).
3. **Secure RLUSD supply and test all trust lines before the demo.** The faucet has a UI, but unattended acquisition was not established; balances, authorization, freezes, and issuer-side rippling can each affect the intended payments. [faucet](https://tryrlusd.com/), [trust-line tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens), [rippled offer checks](https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/ledger/helpers/NFTokenHelpers.cpp#L821-L924).
4. **Do a transaction-level rehearsal.** The zero-price rule and IOU swap path are supported by source, but this investigation intentionally submitted no mint, offer, accept, burn, or payment. Validate both success and failure flows on testnet, including the wallet reserve and final `TransactionResult`, before relying on the board's "claimed" or "paid" states. [finality guidance](https://xrpl.org/docs/concepts/transactions/finality-of-results), [reserve guidance](https://xrpl.org/docs/concepts/accounts/reserves).
