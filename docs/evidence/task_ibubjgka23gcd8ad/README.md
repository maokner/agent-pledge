# On-chain evidence: Reserve a seat for me (Main Stacks, $5.00)

Task `task_ibubjgka23gcd8ad`, status **done**, created 2026-10-11T23:26:33.558Z.
Every row below was read back from the XRPL at wss://s.altnet.rippletest.net:51233 and links to the public explorer.
The raw ledger records, with every full signature, are in [evidence.json](evidence.json).
Token on the ledger: USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT). The board shows it as dollars.

## The four steps

### 1. An NFT is created for the task and goes into escrow

The requester pays $5.00 into the vault: [8AE46C54…876D0777](https://testnet.xrpl.org/transactions/8AE46C54AF2E65B27C270BE12E6EACF2C8E613A2F7A0BFE628F729B2876D0777) (signed by rMmGfq5VJQQkzhmnmpeTLBAp7FouaeewU9).
The vault mints the task NFT [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662): [1FCD6C99…3281BA92](https://testnet.xrpl.org/transactions/1FCD6C99F3DF18744307D2528F1D73A7B889912F6001C6EA285132543281BA92). Its URI points to the task data below.
The vault offers the NFT only to the local agent, for a $1.00 pledge: [DCFE537E…01D5E1CB](https://testnet.xrpl.org/transactions/DCFE537EB71605E4F30ABD42AF798CD4F3722FA7A807C087A32930DF01D5E1CB).
The local agent accepts and pays the pledge in one atomic transaction, so it alone holds the task: [0DF9980E…40A92FBF](https://testnet.xrpl.org/transactions/0DF9980EC10016229F521A979BAF33DD36D0FB0F430C4B52FF95B6F240A92FBF) (signed by the agent key rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg).
The vault now holds the money, and the agent holds the NFT that is the only right to the payout.

### 2. The agent delegates with a new task and posts it on Yik Yak

The agent pays $4.00 for the sub-task into the vault: [E7BB4288…DDA10949](https://testnet.xrpl.org/transactions/E7BB4288931A0477F639076D56A207A557BC3A13FBCB12AC9284ADE6DDA10949) (memo carries the sub-task ID).
The vault mints the sub-task NFT [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) with a `parent-nft` memo that names the task NFT: [9519BC6D…8FF22A1D](https://testnet.xrpl.org/transactions/9519BC6D4FB38E62C5F1F1000068EAEE3B9CEDFC02A898FBD2F637078FF22A1D).
The vault opens a sell offer with no destination, so the first helper to accept gets it: [BE67988A…C302E302](https://testnet.xrpl.org/transactions/BE67988AFE986FCB8076AB5158493A20FFC5F07FC4BC0510DBF75CC0C302E302).
Yik Yak post: "I'll pay $4 if you reserve a seat for me at Main Stacks in the next 20 min. First to claim gets it: https://regulated-improvement-dose-closest.trycloudflare.com/c/2SQC"
Claim link: https://regulated-improvement-dose-closest.trycloudflare.com/c/2SQC

### 3. A helper accepts on Yik Yak and submits the seat photo

A wallet is made for the helper (no app, no seed shown) and it accepts the open offer: [0AEA22FC…BA6CB16F](https://testnet.xrpl.org/transactions/0AEA22FC51520965BB0DCDA8832C0B1C02D9BCC3A8EEBFE151E7D4E0BA6CB16F) (signed by rNfAMjTbezDovvNBxbmVpeBTRMbiQ2LAXW). A second phone would get `tecOBJECT_NOT_FOUND`: the offer is gone.
The helper's photo is on the board and saved here as sub_nbmnz3apl66sq8kq-photo.jpg.
Helper note: "Seat saved: Main Stacks, 2nd floor, by the window, blue backpack on it"

### 4. The PIN releases the sub-task NFT, which releases the task NFT, and the agent keeps $1

After the correct PIN, the helper offers the sub-task NFT back to the vault for $4.00: [AE1B6ECC…55EB9677](https://testnet.xrpl.org/transactions/AE1B6ECCB71C6F947A50D0FABB912595D90C2CC9FB55DB8D24DB101A55EB9677).
The vault accepts: the NFT returns and the helper is paid in one atomic swap: [5843314F…DAE888C8](https://testnet.xrpl.org/transactions/5843314FF027406202AD7858270EC831C5D1F625D4A7BAA9CF3FE5B8DAE888C8) ($4.00).
The server tells the agent the sub-task is paid; the agent offers the task NFT back for $5.00 + $1.00: [949468F1…FD7FE774](https://testnet.xrpl.org/transactions/949468F1FBE7D3E8B0AE1661BEB0FBD6579DB2D368E41CE35DA3E9EDFD7FE774).
The vault accepts and pays the agent: [90AFEFFE…E330E6D2](https://testnet.xrpl.org/transactions/90AFEFFE49BDDC2F4BEEFE51477748CACFD79F85700CBBDD5BAA9120E330E6D2) ($6.00).
The vault burns both NFTs to close the tasks: [974F7728…D790EA2C](https://testnet.xrpl.org/transactions/974F7728E3D740CA01CD2C952F427361175114B384230087A66663D5D790EA2C), [3D3FB2AD…15A849F3](https://testnet.xrpl.org/transactions/3D3FB2ADBE00F7E59DF4B506AB69DBB8DDFFBD5F8034A8A7163E09B315A849F3).
Net: requester −$5.00, helper +$4.00, agent +$1.00 (paid $1.00 pledge + $4.00, received $6.00).

## Every transaction

| # | Step | Transaction | Signer | Amount | NFT | Result | Ledger | Explorer |
|---|---|---|---|---|---|---|---|---|
| 1 | 0. Wallet setup | Payment (requester_funding) | treasury `rDL6eS…3K8e8W` | 5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) |  | tesSUCCESS | 21465606 | [link](https://testnet.xrpl.org/transactions/442EA99C2F81CEF7FD8DAB5B1C26C5792D87606D9A161676046BCB491322387C) |
| 2 | 1. Task NFT in escrow | Payment (task_funding) | requester `rMmGfq…aeewU9` | 5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) |  | tesSUCCESS | 21465608 | [link](https://testnet.xrpl.org/transactions/8AE46C54AF2E65B27C270BE12E6EACF2C8E613A2F7A0BFE628F729B2876D0777) |
| 3 | 1. Task NFT in escrow | NFTokenMint (task_nft_mint) | vault `r37hDa…9HpPjN` |  | [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662) | tesSUCCESS | 21465610 | [link](https://testnet.xrpl.org/transactions/1FCD6C99F3DF18744307D2528F1D73A7B889912F6001C6EA285132543281BA92) |
| 4 | 1. Task NFT in escrow | NFTokenCreateOffer (task_offer) | vault `r37hDa…9HpPjN` | 1 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662) | tesSUCCESS | 21465612 | [link](https://testnet.xrpl.org/transactions/DCFE537EB71605E4F30ABD42AF798CD4F3722FA7A807C087A32930DF01D5E1CB) |
| 5 | 1. Task NFT in escrow | NFTokenAcceptOffer (task_claim) | local agent `rpRVQj…gQZFZg` | $1.00 | [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662) | tesSUCCESS | 21465614 | [link](https://testnet.xrpl.org/transactions/0DF9980EC10016229F521A979BAF33DD36D0FB0F430C4B52FF95B6F240A92FBF) |
| 6 | 2. Delegated sub-task on Yik Yak | Payment (subtask_funding) | local agent `rpRVQj…gQZFZg` | 4 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) |  | tesSUCCESS | 21465616 | [link](https://testnet.xrpl.org/transactions/E7BB4288931A0477F639076D56A207A557BC3A13FBCB12AC9284ADE6DDA10949) |
| 7 | 2. Delegated sub-task on Yik Yak | NFTokenMint (subtask_nft_mint) | vault `r37hDa…9HpPjN` |  | [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) | tesSUCCESS | 21465618 | [link](https://testnet.xrpl.org/transactions/9519BC6D4FB38E62C5F1F1000068EAEE3B9CEDFC02A898FBD2F637078FF22A1D) |
| 8 | 2. Delegated sub-task on Yik Yak | NFTokenCreateOffer (subtask_offer) | vault `r37hDa…9HpPjN` | 0 XRP (0 drops) | [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) | tesSUCCESS | 21465620 | [link](https://testnet.xrpl.org/transactions/BE67988AFE986FCB8076AB5158493A20FFC5F07FC4BC0510DBF75CC0C302E302) |
| 9 | 3. Helper claims and sends the photo | NFTokenAcceptOffer (subtask_claim) | helper `rNfAMj…Q2LAXW` |  | [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) | tesSUCCESS | 21465641 | [link](https://testnet.xrpl.org/transactions/0AEA22FC51520965BB0DCDA8832C0B1C02D9BCC3A8EEBFE151E7D4E0BA6CB16F) |
| 10 | 4. Photo and PIN release the NFTs | NFTokenCreateOffer (helper_redeem_offer) | helper `rNfAMj…Q2LAXW` | 4 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) | tesSUCCESS | 21465661 | [link](https://testnet.xrpl.org/transactions/AE1B6ECCB71C6F947A50D0FABB912595D90C2CC9FB55DB8D24DB101A55EB9677) |
| 11 | 4. Photo and PIN release the NFTs | NFTokenAcceptOffer (helper_payout) | vault `r37hDa…9HpPjN` | $4.00 | [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) | tesSUCCESS | 21465663 | [link](https://testnet.xrpl.org/transactions/5843314FF027406202AD7858270EC831C5D1F625D4A7BAA9CF3FE5B8DAE888C8) |
| 12 | 4. Photo and PIN release the NFTs | NFTokenBurn (subtask_nft_burn) | vault `r37hDa…9HpPjN` |  | [00090000…01478663](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663) | tesSUCCESS | 21465665 | [link](https://testnet.xrpl.org/transactions/974F7728E3D740CA01CD2C952F427361175114B384230087A66663D5D790EA2C) |
| 13 | 4. Photo and PIN release the NFTs | NFTokenCreateOffer (agent_redeem_offer) | local agent `rpRVQj…gQZFZg` | 6 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662) | tesSUCCESS | 21465666 | [link](https://testnet.xrpl.org/transactions/949468F1FBE7D3E8B0AE1661BEB0FBD6579DB2D368E41CE35DA3E9EDFD7FE774) |
| 14 | 4. Photo and PIN release the NFTs | NFTokenAcceptOffer (agent_payout) | vault `r37hDa…9HpPjN` | $6.00 | [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662) | tesSUCCESS | 21465668 | [link](https://testnet.xrpl.org/transactions/90AFEFFE49BDDC2F4BEEFE51477748CACFD79F85700CBBDD5BAA9120E330E6D2) |
| 15 | 4. Photo and PIN release the NFTs | NFTokenBurn (task_nft_burn) | vault `r37hDa…9HpPjN` |  | [00090000…01478662](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662) | tesSUCCESS | 21465669 | [link](https://testnet.xrpl.org/transactions/3D3FB2ADBE00F7E59DF4B506AB69DBB8DDFFBD5F8034A8A7163E09B315A849F3) |

## Signatures

Each transaction is signed by the key of the account that acts, and the XRPL validators accepted it with `tesSUCCESS`.

### 1. Payment (requester_funding)

- Hash: `442EA99C2F81CEF7FD8DAB5B1C26C5792D87606D9A161676046BCB491322387C`
- Signer: treasury `rDL6eSZQm3RMxdNQCEQtbKtjGNFN3K8e8W`
- Destination: requester `rMmGfq5VJQQkzhmnmpeTLBAp7FouaeewU9`
- Delivered: 5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- Settles: $5.00 (the price of the accepted offer)
- Flags: 0
- Sequence: 21464673
- Fee: 12 drops
- Ledger: 21465606 (CTID C1478A0600070001), closed 2026-10-11T23:26:42Z
- Result: `tesSUCCESS`
- Signing public key: `ED8E2AD5BF779BD15758BF83C04D198438235C629145D4B69159BB51C6FCCE70DF`
- Signature: `259BEAD82FA1BA844776D0AAECACD268894B9D47B73D74F4D19B34C8F1B606F7814FA66A86D309B34164ECC8D7045401034EDD4AE0F1BE5D8C82CAFEBB8D470C`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `token.transfer`
- Explorer: https://testnet.xrpl.org/transactions/442EA99C2F81CEF7FD8DAB5B1C26C5792D87606D9A161676046BCB491322387C

### 2. Payment (task_funding)

- Hash: `8AE46C54AF2E65B27C270BE12E6EACF2C8E613A2F7A0BFE628F729B2876D0777`
- Signer: requester `rMmGfq5VJQQkzhmnmpeTLBAp7FouaeewU9`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Delivered: 5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- Settles: $5.00 (the price of the accepted offer)
- Flags: 0
- Sequence: 21465605
- Fee: 12 drops
- Ledger: 21465608 (CTID C1478A0800050001), closed 2026-10-11T23:26:51Z
- Result: `tesSUCCESS`
- Signing public key: `EDF6DDF8FC0C1F148F5227AC926C50A474772FA22D2CE724B12394C70EF4ADAB1F`
- Signature: `5F34F0B6678EF5BFB9D89B085E6074F7D25330BF449A106E6A23CF11D9F285100E99E169EE87F8547BC6F5FC8D6B2B46ADDBC0D1A24DBED25ADF6C5FBD9F0607`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `task.fund`
- Explorer: https://testnet.xrpl.org/transactions/8AE46C54AF2E65B27C270BE12E6EACF2C8E613A2F7A0BFE628F729B2876D0777

### 3. NFTokenMint (task_nft_mint)

- Hash: `1FCD6C99F3DF18744307D2528F1D73A7B889912F6001C6EA285132543281BA92`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`
- URI: https://regulated-improvement-dose-closest.trycloudflare.com/tasks/task_ibubjgka23gcd8ad.json
- Flags: 9
- Sequence: 21464686
- Fee: 12 drops
- Ledger: 21465610 (CTID C1478A0A000E0001), closed 2026-10-11T23:27:00Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `0C7FE2FE6F3BDB2DCCED79E1BDA9844CAB70DDA138ACC497205F9DE771011AC2CF81506775CF0708AB430D55E0E7AA10546B572485C8B4153D81B86B18B03900`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `task.mint`
- Explorer: https://testnet.xrpl.org/transactions/1FCD6C99F3DF18744307D2528F1D73A7B889912F6001C6EA285132543281BA92

### 4. NFTokenCreateOffer (task_offer)

- Hash: `DCFE537EB71605E4F30ABD42AF798CD4F3722FA7A807C087A32930DF01D5E1CB`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Destination: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Amount: 1 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`
- Offer: `E5C0F789590200E6731A12A7C23F99FB061701C15046B877B1C7F1F8B5EBC790`
- Flags: 1
- Sequence: 21464687
- Fee: 12 drops
- Ledger: 21465612 (CTID C1478A0C00020001), closed 2026-10-11T23:27:02Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `F025655996B373B532357E2F48B8D51FF3CDD46B391133C63EAAFD2E7DCC2EC5FA6401032B8EECB080FA0F627AF38AEE6D0D8D930CBEDA34BC58D01EB9D9530A`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `task.offer`
- Explorer: https://testnet.xrpl.org/transactions/DCFE537EB71605E4F30ABD42AF798CD4F3722FA7A807C087A32930DF01D5E1CB

### 5. NFTokenAcceptOffer (task_claim)

- Hash: `0DF9980EC10016229F521A979BAF33DD36D0FB0F430C4B52FF95B6F240A92FBF`
- Signer: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Settles: $1.00 (the price of the accepted offer)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`
- Offer: `E5C0F789590200E6731A12A7C23F99FB061701C15046B877B1C7F1F8B5EBC790`
- Flags: 0
- Sequence: 21464675
- Fee: 12 drops
- Ledger: 21465614 (CTID C1478A0E00000001), closed 2026-10-11T23:27:11Z
- Result: `tesSUCCESS`
- Signing public key: `ED6DCF671661492EC87DB60AE9C8BCB62673D49D4CD8AFA0B42C634C3EC0121DF0`
- Signature: `8E7F15CF11C79C8F1E32F4B8576896E7CD43BCE0CDEF6641A89B021EF840C494A98E7167251673651FB4A5D050A9E2172B493B485B5BD80CB7EDD4A78E256E07`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `task.claim`
- Explorer: https://testnet.xrpl.org/transactions/0DF9980EC10016229F521A979BAF33DD36D0FB0F430C4B52FF95B6F240A92FBF

### 6. Payment (subtask_funding)

- Hash: `E7BB4288931A0477F639076D56A207A557BC3A13FBCB12AC9284ADE6DDA10949`
- Signer: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Delivered: 4 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- Settles: $4.00 (the price of the accepted offer)
- Flags: 0
- Sequence: 21464676
- Fee: 12 drops
- Ledger: 21465616 (CTID C1478A1000100001), closed 2026-10-11T23:27:20Z
- Result: `tesSUCCESS`
- Signing public key: `ED6DCF671661492EC87DB60AE9C8BCB62673D49D4CD8AFA0B42C634C3EC0121DF0`
- Signature: `BB7F728B9987F24DA5C09ED050B623AAEE91C7E512B420DDD637A79C3B25EABF4738770AD04AD8E90477565FB5CB0CED654A01A1F055944D69234E53521D8D0D`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/action` = `subtask.fund`
- Explorer: https://testnet.xrpl.org/transactions/E7BB4288931A0477F639076D56A207A557BC3A13FBCB12AC9284ADE6DDA10949

### 7. NFTokenMint (subtask_nft_mint)

- Hash: `9519BC6D4FB38E62C5F1F1000068EAEE3B9CEDFC02A898FBD2F637078FF22A1D`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`
- URI: https://regulated-improvement-dose-closest.trycloudflare.com/tasks/sub_nbmnz3apl66sq8kq.json
- Flags: 9
- Sequence: 21464688
- Fee: 12 drops
- Ledger: 21465618 (CTID C1478A1200090001), closed 2026-10-11T23:27:22Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `6313D5BAED910B96C1FE80F2EB88143DA9EDBE587E4EFD27E66812CF32A8836A74683D50B08C03BCA9D763BD5152404F21F3746632B57D53BAB39C40CEF3ED0B`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/parent-nft` = `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`, `agent-pledge/action` = `subtask.mint`
- Explorer: https://testnet.xrpl.org/transactions/9519BC6D4FB38E62C5F1F1000068EAEE3B9CEDFC02A898FBD2F637078FF22A1D

### 8. NFTokenCreateOffer (subtask_offer)

- Hash: `BE67988AFE986FCB8076AB5158493A20FFC5F07FC4BC0510DBF75CC0C302E302`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Amount: 0 XRP (0 drops)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`
- Offer: `70DDF5377CD21D6F33213399FB2F6F307D0875F0597BF594F7AB8B5504A47E5B`
- Flags: 1
- Sequence: 21464689
- Fee: 12 drops
- Ledger: 21465620 (CTID C1478A1400020001), closed 2026-10-11T23:27:31Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `C29B08D9D415318410A25F2AEA5C42307EE9A0A3F0DCA70A20E646CC14CB1A1295E92A16128A869BB4CB2B60A5EB0483090BE0E3CD06428DC1608C5E26ABBD0B`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/action` = `subtask.offer`
- Explorer: https://testnet.xrpl.org/transactions/BE67988AFE986FCB8076AB5158493A20FFC5F07FC4BC0510DBF75CC0C302E302

### 9. NFTokenAcceptOffer (subtask_claim)

- Hash: `0AEA22FC51520965BB0DCDA8832C0B1C02D9BCC3A8EEBFE151E7D4E0BA6CB16F`
- Signer: helper `rNfAMjTbezDovvNBxbmVpeBTRMbiQ2LAXW`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`
- Offer: `70DDF5377CD21D6F33213399FB2F6F307D0875F0597BF594F7AB8B5504A47E5B`
- Flags: 0
- Sequence: 21465599
- Fee: 12 drops
- Ledger: 21465641 (CTID C1478A2900000001), closed 2026-10-11T23:28:41Z
- Result: `tesSUCCESS`
- Signing public key: `EDE132DA4A773EF9330E910F3147A6EB39E95FABAE6EE18C228791C8FBC9254F96`
- Signature: `01BDF964FA0FBC0213884C362A6824D255F37112DFEEE3B2B7C19815E96D43AA29398C53276683F74EA783DE57369A80E818CBF5787FF4988B1F56E062969509`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/action` = `subtask.claim`
- Explorer: https://testnet.xrpl.org/transactions/0AEA22FC51520965BB0DCDA8832C0B1C02D9BCC3A8EEBFE151E7D4E0BA6CB16F

### 10. NFTokenCreateOffer (helper_redeem_offer)

- Hash: `AE1B6ECCB71C6F947A50D0FABB912595D90C2CC9FB55DB8D24DB101A55EB9677`
- Signer: helper `rNfAMjTbezDovvNBxbmVpeBTRMbiQ2LAXW`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Amount: 4 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`
- Offer: `2B53DBA1F8FAEA6FCC450B77F0CF204BE2B5234FD6C0EE25113AD61BFA0A164E`
- Flags: 1
- Sequence: 21465600
- Fee: 12 drops
- Ledger: 21465661 (CTID C1478A3D000A0001), closed 2026-10-11T23:29:50Z
- Result: `tesSUCCESS`
- Signing public key: `EDE132DA4A773EF9330E910F3147A6EB39E95FABAE6EE18C228791C8FBC9254F96`
- Signature: `7A195F02C1A01B0C544524051351CC6EB29AA1E5867C1E6334B1D0685A2D8AB18622D125DB84A91B26DF6F09FDFA389FA7D0C7B0C8C6814CD94D6AC1FEB08103`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/action` = `payout.offer`
- Explorer: https://testnet.xrpl.org/transactions/AE1B6ECCB71C6F947A50D0FABB912595D90C2CC9FB55DB8D24DB101A55EB9677

### 11. NFTokenAcceptOffer (helper_payout)

- Hash: `5843314FF027406202AD7858270EC831C5D1F625D4A7BAA9CF3FE5B8DAE888C8`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Settles: $4.00 (the price of the accepted offer)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`
- Offer: `2B53DBA1F8FAEA6FCC450B77F0CF204BE2B5234FD6C0EE25113AD61BFA0A164E`
- Flags: 0
- Sequence: 21464690
- Fee: 12 drops
- Ledger: 21465663 (CTID C1478A3F00020001), closed 2026-10-11T23:29:52Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `9AC7F818C9D7CC4B26653789CB25961D54B037363582E3F48C022054AF07D46CC1D6E740AF0B097369DFDF0A408FC4C96B85783116AB4DCF2FEA818807023202`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/action` = `payout.accept`
- Explorer: https://testnet.xrpl.org/transactions/5843314FF027406202AD7858270EC831C5D1F625D4A7BAA9CF3FE5B8DAE888C8

### 12. NFTokenBurn (subtask_nft_burn)

- Hash: `974F7728E3D740CA01CD2C952F427361175114B384230087A66663D5D790EA2C`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`
- Flags: 0
- Sequence: 21464691
- Fee: 12 drops
- Ledger: 21465665 (CTID C1478A4100070001), closed 2026-10-11T23:30:01Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `45C190875F45964EFF40E2519AD23FE6676C39F9C4AB7E4B8483D0765546789945F8FE4B46535FE15C4A13435BCEB5DCE780FE4E6ABD27D08BD34984AE61C50B`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/subtask` = `sub_nbmnz3apl66sq8kq`, `agent-pledge/action` = `nft.burn`
- Explorer: https://testnet.xrpl.org/transactions/974F7728E3D740CA01CD2C952F427361175114B384230087A66663D5D790EA2C

### 13. NFTokenCreateOffer (agent_redeem_offer)

- Hash: `949468F1FBE7D3E8B0AE1661BEB0FBD6579DB2D368E41CE35DA3E9EDFD7FE774`
- Signer: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Amount: 6 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`
- Offer: `9CB91E40B872B1A91DDA30CE62C19C27705C899603C50F8350A02FEE4F6B15C8`
- Flags: 1
- Sequence: 21464677
- Fee: 12 drops
- Ledger: 21465666 (CTID C1478A4200000001), closed 2026-10-11T23:30:10Z
- Result: `tesSUCCESS`
- Signing public key: `ED6DCF671661492EC87DB60AE9C8BCB62673D49D4CD8AFA0B42C634C3EC0121DF0`
- Signature: `4971E71D3C2D236FBB96D9765D474597E28FEA7A5785D454A371FD8945DD0B0C28DD312A8A5189370D0DA1AA07E1AE819A862636563882241A5BA9B2B8C66A0D`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `payout.offer`
- Explorer: https://testnet.xrpl.org/transactions/949468F1FBE7D3E8B0AE1661BEB0FBD6579DB2D368E41CE35DA3E9EDFD7FE774

### 14. NFTokenAcceptOffer (agent_payout)

- Hash: `90AFEFFE49BDDC2F4BEEFE51477748CACFD79F85700CBBDD5BAA9120E330E6D2`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Settles: $6.00 (the price of the accepted offer)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`
- Offer: `9CB91E40B872B1A91DDA30CE62C19C27705C899603C50F8350A02FEE4F6B15C8`
- Flags: 0
- Sequence: 21464692
- Fee: 12 drops
- Ledger: 21465668 (CTID C1478A4400070001), closed 2026-10-11T23:30:12Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `AFB4809BF7E3553619108A21F332A50649950191657D2A2DA8D79D2CB94D8773F2DAB469197E870DB107D4151850C70CAE5F2C4431FC1E25B2A848161A1C7A00`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `payout.accept`
- Explorer: https://testnet.xrpl.org/transactions/90AFEFFE49BDDC2F4BEEFE51477748CACFD79F85700CBBDD5BAA9120E330E6D2

### 15. NFTokenBurn (task_nft_burn)

- Hash: `3D3FB2ADBE00F7E59DF4B506AB69DBB8DDFFBD5F8034A8A7163E09B315A849F3`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`
- Flags: 0
- Sequence: 21464693
- Fee: 12 drops
- Ledger: 21465669 (CTID C1478A4500000001), closed 2026-10-11T23:30:20Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `8E26A9FFCE1496B994551E49BF3AF7446A04D5F8634362A2EABF35281D8E65B67F99974C4B51F11CF8B928E0E1BEA5E32412AF534AADE91EA01E30557903120B`
- Memos: `agent-pledge/task` = `task_ibubjgka23gcd8ad`, `agent-pledge/action` = `nft.burn`
- Explorer: https://testnet.xrpl.org/transactions/3D3FB2ADBE00F7E59DF4B506AB69DBB8DDFFBD5F8034A8A7163E09B315A849F3

## The NFTs

### Task NFT `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662`

Explorer: https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662

- NFTokenMint by vault: [1FCD6C99…3281BA92](https://testnet.xrpl.org/transactions/1FCD6C99F3DF18744307D2528F1D73A7B889912F6001C6EA285132543281BA92)
- NFTokenCreateOffer by vault: [DCFE537E…01D5E1CB](https://testnet.xrpl.org/transactions/DCFE537EB71605E4F30ABD42AF798CD4F3722FA7A807C087A32930DF01D5E1CB)
- NFTokenAcceptOffer by local agent: [0DF9980E…40A92FBF](https://testnet.xrpl.org/transactions/0DF9980EC10016229F521A979BAF33DD36D0FB0F430C4B52FF95B6F240A92FBF)
- NFTokenCreateOffer by local agent: [949468F1…FD7FE774](https://testnet.xrpl.org/transactions/949468F1FBE7D3E8B0AE1661BEB0FBD6579DB2D368E41CE35DA3E9EDFD7FE774)
- NFTokenAcceptOffer by vault: [90AFEFFE…E330E6D2](https://testnet.xrpl.org/transactions/90AFEFFE49BDDC2F4BEEFE51477748CACFD79F85700CBBDD5BAA9120E330E6D2)
- NFTokenBurn by vault: [3D3FB2AD…15A849F3](https://testnet.xrpl.org/transactions/3D3FB2ADBE00F7E59DF4B506AB69DBB8DDFFBD5F8034A8A7163E09B315A849F3)

URI data (`/tasks/task_ibubjgka23gcd8ad.json`):

```json
{
  "id": "task_ibubjgka23gcd8ad",
  "kind": "task",
  "description": "Reserve a seat for me",
  "place": "Main Stacks",
  "price": "5.00",
  "deadline": "2026-10-11T23:46:33.558Z",
  "status": "done",
  "nft_id": "0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662",
  "parent_task_id": null,
  "parent_nft_id": null,
  "board_url": "https://regulated-improvement-dose-closest.trycloudflare.com/?task=task_ibubjgka23gcd8ad"
}
```

### Sub-task NFT `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663`

Explorer: https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663

- NFTokenMint by vault: [9519BC6D…8FF22A1D](https://testnet.xrpl.org/transactions/9519BC6D4FB38E62C5F1F1000068EAEE3B9CEDFC02A898FBD2F637078FF22A1D)
- NFTokenCreateOffer by vault: [BE67988A…C302E302](https://testnet.xrpl.org/transactions/BE67988AFE986FCB8076AB5158493A20FFC5F07FC4BC0510DBF75CC0C302E302)
- NFTokenAcceptOffer by helper: [0AEA22FC…BA6CB16F](https://testnet.xrpl.org/transactions/0AEA22FC51520965BB0DCDA8832C0B1C02D9BCC3A8EEBFE151E7D4E0BA6CB16F)
- NFTokenCreateOffer by helper: [AE1B6ECC…55EB9677](https://testnet.xrpl.org/transactions/AE1B6ECCB71C6F947A50D0FABB912595D90C2CC9FB55DB8D24DB101A55EB9677)
- NFTokenAcceptOffer by vault: [5843314F…DAE888C8](https://testnet.xrpl.org/transactions/5843314FF027406202AD7858270EC831C5D1F625D4A7BAA9CF3FE5B8DAE888C8)
- NFTokenBurn by vault: [974F7728…D790EA2C](https://testnet.xrpl.org/transactions/974F7728E3D740CA01CD2C952F427361175114B384230087A66663D5D790EA2C)

URI data (`/tasks/sub_nbmnz3apl66sq8kq.json`):

```json
{
  "id": "sub_nbmnz3apl66sq8kq",
  "kind": "subtask",
  "description": "Reserve a seat for me",
  "place": "Main Stacks",
  "price": "4.00",
  "deadline": "2026-10-11T23:46:33.558Z",
  "status": "done",
  "nft_id": "0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD1E8D62FC01478663",
  "parent_task_id": "task_ibubjgka23gcd8ad",
  "parent_nft_id": "0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD07A791FC01478662",
  "board_url": "https://regulated-improvement-dose-closest.trycloudflare.com/?task=task_ibubjgka23gcd8ad"
}
```

## Final balances

| Role | Address | XRP | Tokens | NFTs held |
|---|---|---|---|---|
| vault | [r37hDaqXGUL574V8y91XSoktYDpc9HpPjN](https://testnet.xrpl.org/accounts/r37hDaqXGUL574V8y91XSoktYDpc9HpPjN) | 99.999700 | 1 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |
| local agent | [rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg](https://testnet.xrpl.org/accounts/rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg) | 99.999892 | 101 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |
| treasury | [rDL6eSZQm3RMxdNQCEQtbKtjGNFN3K8e8W](https://testnet.xrpl.org/accounts/rDL6eSZQm3RMxdNQCEQtbKtjGNFN3K8e8W) | 99.999940 | 84 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |
| requester | [rMmGfq5VJQQkzhmnmpeTLBAp7FouaeewU9](https://testnet.xrpl.org/accounts/rMmGfq5VJQQkzhmnmpeTLBAp7FouaeewU9) | 99.999976 | 0 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |
| helper | [rNfAMjTbezDovvNBxbmVpeBTRMbiQ2LAXW](https://testnet.xrpl.org/accounts/rNfAMjTbezDovvNBxbmVpeBTRMbiQ2LAXW) | 99.999964 | 4 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |

The vault holds no NFT at the end, so both tasks are closed.
The helper and the agent hold none either, because the payout swap moved each NFT back to the vault before the burn.

## Media

- Helper photo: [sub_nbmnz3apl66sq8kq-photo.jpg](sub_nbmnz3apl66sq8kq-photo.jpg) (served at https://regulated-improvement-dose-closest.trycloudflare.com/media/med_bim2v6pf34nb3ag5)
- Yik Yak post: [sub_nbmnz3apl66sq8kq-yikyak.jpg](sub_nbmnz3apl66sq8kq-yikyak.jpg) (served at https://regulated-improvement-dose-closest.trycloudflare.com/media/med_3m6hdqnsdwhb0wko)

## Screenshots

Board and claim page during the run, in order.

- [01-board-open-subtask.png](screenshots/01-board-open-subtask.png)
- [02-board-projector-open.png](screenshots/02-board-projector-open.png)
- [03-claim-open.png](screenshots/03-claim-open.png)
- [04-claim-claimed.png](screenshots/04-claim-claimed.png)
- [05-claim-photo.png](screenshots/05-claim-photo.png)
- [06-board-photo.png](screenshots/06-board-photo.png)
- [07-claim-wrong-pin.png](screenshots/07-claim-wrong-pin.png)
- [08-claim-paid.png](screenshots/08-claim-paid.png)
- [08b-claim-paid-fullpage.png](screenshots/08b-claim-paid-fullpage.png)
- [09-explorer-helper-payout.png](screenshots/09-explorer-helper-payout.png)
- [10-board-paid.png](screenshots/10-board-paid.png)
- [11-board-projector-paid.png](screenshots/11-board-projector-paid.png)
- [12-board-transactions.png](screenshots/12-board-transactions.png)
- [13-human-list.png](screenshots/13-human-list.png)
