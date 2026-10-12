# On-chain evidence: Deliver me a peach-flavored Ghost energy drink (1234 Main St, Berkeley CA, $7.00)

Task `task_tocrvmv90cv1ojpy`, status **done**, created 2026-10-12T08:31:15.591Z.
Every row below was read back from the XRPL at wss://s.altnet.rippletest.net:51233 and links to the public explorer.
The raw ledger records, with every full signature, are in [evidence.json](evidence.json).
Token on the ledger: USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT). The board shows it as dollars.

## The four steps

### 1. An NFT is created for the task and goes into escrow

The requester pays $7.00 into the vault: [245F6D2D…D104F458](https://testnet.xrpl.org/transactions/245F6D2DD2483771A7C3C0C409DB66E88B33212BF232AAD7ABE5D6DED104F458) (signed by rBSSq1ZKWbjhF5wxzYWzFVygiWfyQqLxeg).
The vault mints the task NFT [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675): [A1488F09…198C10C8](https://testnet.xrpl.org/transactions/A1488F09BF0E5C16EF8C00925FB11320C603DD6BF458F44218A0414D198C10C8). Its URI points to the task data below.
The vault offers the NFT only to the local agent, for a $1.00 pledge: [7F6BFE30…B8A10DA2](https://testnet.xrpl.org/transactions/7F6BFE30FD05CC1A28C813D0F10BEAB4205C38BE72C9634010B6A49DB8A10DA2).
The local agent accepts and pays the pledge in one atomic transaction, so it alone holds the task: [7DD95960…EF207292](https://testnet.xrpl.org/transactions/7DD95960D367A3FF716778579F76F83324861BCB7F122A68E4B9BB96EF207292) (signed by the agent key rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg).
The vault now holds the money, and the agent holds the NFT that is the only right to the payout.

### 2. The agent delegates with a new task and posts it on Yik Yak

The agent pays $5.50 for the sub-task into the vault: [25E2B77A…1EB90CDC](https://testnet.xrpl.org/transactions/25E2B77A271EF6ACFBFE91485B6502F63DE3EE48F2B13C11B6A5BFA11EB90CDC) (memo carries the sub-task ID).
The vault mints the sub-task NFT [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) with a `parent-nft` memo that names the task NFT: [7D4EF37D…C599BBFF](https://testnet.xrpl.org/transactions/7D4EF37D4D082B7877F0B5FF640EFC3C2E57EA8ACAED57EF18CBA1A5C599BBFF).
The vault opens a sell offer with no destination, so the first helper to accept gets it: [AA3F15B6…36182A76](https://testnet.xrpl.org/transactions/AA3F15B61B4EB0EF1985AE0D42F64AEC8B6D1F72F0CAE784D77BD5E936182A76).
Yik Yak post: "I'll pay $5.50 if you deliver a peach-flavored Ghost energy drink at 1234 Main St, Berkeley CA in the next 240 min. First to claim gets it: https://www.yopledge.site/c/3ZYY"
Claim link: https://www.yopledge.site/c/3ZYY

### 3. A helper accepts on Yik Yak and submits the seat photo

A wallet is made for the helper (no app, no seed shown) and it accepts the open offer: [92727484…65936D14](https://testnet.xrpl.org/transactions/92727484C16AA30623ABC51431FC0BB68F248D887E4F7F24CAB8E02B65936D14) (signed by rNeoVmPNgr1LQM23q95RaXrN4Hr1E2PwSn). A second phone would get `tecOBJECT_NOT_FOUND`: the offer is gone.
The helper's photo is on the board and saved here as sub_m1eefzkvud77hgws-photo.jpg.
Helper note: "Left it with the front desk, peach Ghost, cold"

### 4. The PIN releases the sub-task NFT, which releases the task NFT, and the agent keeps $1

After the correct PIN, the helper offers the sub-task NFT back to the vault for $5.50: [F6F9C13D…F9EF5629](https://testnet.xrpl.org/transactions/F6F9C13D5F72E5A99CE23B5DD392602B9E9ED2D58FE127486199EAB0F9EF5629).
The vault accepts: the NFT returns and the helper is paid in one atomic swap: [A7DA8F81…BF8569EF](https://testnet.xrpl.org/transactions/A7DA8F81E9C9F8E0A67DD616292F3B2C73072C9868C424D36A794B18BF8569EF) ($5.50).
The server tells the agent the sub-task is paid; the agent offers the task NFT back for $7.00 + $1.00: [16F66D3C…55440DFD](https://testnet.xrpl.org/transactions/16F66D3C05F29888CBD6FF47FBA21EEF21F80D7524E962AA1E70C3BE55440DFD).
The vault accepts and pays the agent: [EEF998D5…89978B88](https://testnet.xrpl.org/transactions/EEF998D589BC67ED1896F9A036BDF5BBFC10618E993846D48D14AE5689978B88) ($8.00).
The vault burns both NFTs to close the tasks: [FE62CF9C…87A31C4C](https://testnet.xrpl.org/transactions/FE62CF9C07C627646F0AD55938E1BC02B34FF51069B6DBD8D218218287A31C4C), [CD2DE5A4…9E39ABA9](https://testnet.xrpl.org/transactions/CD2DE5A40E3AB62814FEC6F6A6570FDAE7585B0F16F1C1C4F4534CE99E39ABA9).
Net: requester −$7.00, helper +$5.50, agent +$1.50 (paid $1.00 pledge + $5.50, received $8.00).

## Every transaction

| # | Step | Transaction | Signer | Amount | NFT | Result | Ledger | Explorer |
|---|---|---|---|---|---|---|---|---|
| 1 | 0. Wallet setup | Payment (requester_funding) | treasury `rDL6eS…3K8e8W` | 7 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) |  | tesSUCCESS | 21475043 | [link](https://testnet.xrpl.org/transactions/F5C3C91AB099841F2F7F7BBE0B0E9748E08469B33CF8F0E4742F5A246D7A072E) |
| 2 | 1. Task NFT in escrow | Payment (task_funding) | requester `rBSSq1…QqLxeg` | 7 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) |  | tesSUCCESS | 21475045 | [link](https://testnet.xrpl.org/transactions/245F6D2DD2483771A7C3C0C409DB66E88B33212BF232AAD7ABE5D6DED104F458) |
| 3 | 1. Task NFT in escrow | NFTokenMint (task_nft_mint) | vault `r37hDa…9HpPjN` |  | [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675) | tesSUCCESS | 21475047 | [link](https://testnet.xrpl.org/transactions/A1488F09BF0E5C16EF8C00925FB11320C603DD6BF458F44218A0414D198C10C8) |
| 4 | 1. Task NFT in escrow | NFTokenCreateOffer (task_offer) | vault `r37hDa…9HpPjN` | 1 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675) | tesSUCCESS | 21475049 | [link](https://testnet.xrpl.org/transactions/7F6BFE30FD05CC1A28C813D0F10BEAB4205C38BE72C9634010B6A49DB8A10DA2) |
| 5 | 1. Task NFT in escrow | NFTokenAcceptOffer (task_claim) | local agent `rpRVQj…gQZFZg` | $1.00 | [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675) | tesSUCCESS | 21475085 | [link](https://testnet.xrpl.org/transactions/7DD95960D367A3FF716778579F76F83324861BCB7F122A68E4B9BB96EF207292) |
| 6 | 2. Delegated sub-task on Yik Yak | Payment (subtask_funding) | local agent `rpRVQj…gQZFZg` | 5.5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) |  | tesSUCCESS | 21475087 | [link](https://testnet.xrpl.org/transactions/25E2B77A271EF6ACFBFE91485B6502F63DE3EE48F2B13C11B6A5BFA11EB90CDC) |
| 7 | 2. Delegated sub-task on Yik Yak | NFTokenMint (subtask_nft_mint) | vault `r37hDa…9HpPjN` |  | [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) | tesSUCCESS | 21475089 | [link](https://testnet.xrpl.org/transactions/7D4EF37D4D082B7877F0B5FF640EFC3C2E57EA8ACAED57EF18CBA1A5C599BBFF) |
| 8 | 2. Delegated sub-task on Yik Yak | NFTokenCreateOffer (subtask_offer) | vault `r37hDa…9HpPjN` | 0 XRP (0 drops) | [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) | tesSUCCESS | 21475090 | [link](https://testnet.xrpl.org/transactions/AA3F15B61B4EB0EF1985AE0D42F64AEC8B6D1F72F0CAE784D77BD5E936182A76) |
| 9 | 3. Helper claims and sends the photo | NFTokenAcceptOffer (subtask_claim) | helper `rNeoVm…E2PwSn` |  | [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) | tesSUCCESS | 21475143 | [link](https://testnet.xrpl.org/transactions/92727484C16AA30623ABC51431FC0BB68F248D887E4F7F24CAB8E02B65936D14) |
| 10 | 4. Photo and PIN release the NFTs | NFTokenCreateOffer (helper_redeem_offer) | helper `rNeoVm…E2PwSn` | 5.5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) | tesSUCCESS | 21475198 | [link](https://testnet.xrpl.org/transactions/F6F9C13D5F72E5A99CE23B5DD392602B9E9ED2D58FE127486199EAB0F9EF5629) |
| 11 | 4. Photo and PIN release the NFTs | NFTokenAcceptOffer (helper_payout) | vault `r37hDa…9HpPjN` | $5.50 | [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) | tesSUCCESS | 21475199 | [link](https://testnet.xrpl.org/transactions/A7DA8F81E9C9F8E0A67DD616292F3B2C73072C9868C424D36A794B18BF8569EF) |
| 12 | 4. Photo and PIN release the NFTs | NFTokenBurn (subtask_nft_burn) | vault `r37hDa…9HpPjN` |  | [00090000…0147867B](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B) | tesSUCCESS | 21475201 | [link](https://testnet.xrpl.org/transactions/FE62CF9C07C627646F0AD55938E1BC02B34FF51069B6DBD8D218218287A31C4C) |
| 13 | 4. Photo and PIN release the NFTs | NFTokenCreateOffer (agent_redeem_offer) | local agent `rpRVQj…gQZFZg` | 8 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675) | tesSUCCESS | 21475203 | [link](https://testnet.xrpl.org/transactions/16F66D3C05F29888CBD6FF47FBA21EEF21F80D7524E962AA1E70C3BE55440DFD) |
| 14 | 4. Photo and PIN release the NFTs | NFTokenAcceptOffer (agent_payout) | vault `r37hDa…9HpPjN` | $8.00 | [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675) | tesSUCCESS | 21475205 | [link](https://testnet.xrpl.org/transactions/EEF998D589BC67ED1896F9A036BDF5BBFC10618E993846D48D14AE5689978B88) |
| 15 | 4. Photo and PIN release the NFTs | NFTokenBurn (task_nft_burn) | vault `r37hDa…9HpPjN` |  | [00090000…01478675](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675) | tesSUCCESS | 21475207 | [link](https://testnet.xrpl.org/transactions/CD2DE5A40E3AB62814FEC6F6A6570FDAE7585B0F16F1C1C4F4534CE99E39ABA9) |

## Signatures

Each transaction is signed by the key of the account that acts, and the XRPL validators accepted it with `tesSUCCESS`.

### 1. Payment (requester_funding)

- Hash: `F5C3C91AB099841F2F7F7BBE0B0E9748E08469B33CF8F0E4742F5A246D7A072E`
- Signer: treasury `rDL6eSZQm3RMxdNQCEQtbKtjGNFN3K8e8W`
- Destination: requester `rBSSq1ZKWbjhF5wxzYWzFVygiWfyQqLxeg`
- Delivered: 7 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- Settles: $7.00 (the price of the accepted offer)
- Flags: 0
- Sequence: 21464683
- Fee: 12 drops
- Ledger: 21475043 (CTID C147AEE3000D0001), closed 2026-10-12T08:31:32Z
- Result: `tesSUCCESS`
- Signing public key: `ED8E2AD5BF779BD15758BF83C04D198438235C629145D4B69159BB51C6FCCE70DF`
- Signature: `2A8F6199C5F189667611341D3ACE0C5CF9F72B31E40C478656AD39B624BE157D3CA0ADCE5BA8E9286B1E4C5339C772288F75BBF408A7DD0ABA9D21325645E901`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `token.transfer`
- Explorer: https://testnet.xrpl.org/transactions/F5C3C91AB099841F2F7F7BBE0B0E9748E08469B33CF8F0E4742F5A246D7A072E

### 2. Payment (task_funding)

- Hash: `245F6D2DD2483771A7C3C0C409DB66E88B33212BF232AAD7ABE5D6DED104F458`
- Signer: requester `rBSSq1ZKWbjhF5wxzYWzFVygiWfyQqLxeg`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Delivered: 7 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- Settles: $7.00 (the price of the accepted offer)
- Flags: 0
- Sequence: 21475040
- Fee: 12 drops
- Ledger: 21475045 (CTID C147AEE500210001), closed 2026-10-12T08:31:41Z
- Result: `tesSUCCESS`
- Signing public key: `ED5CDCE27C8A466ED13CE103D25E462F5D15EC6B6B814952D7CA120D8E7579764B`
- Signature: `3ACA79BCF723913C87879647076AD3C5FDC7C54E814C0EB55DBAF37AEA8B57D4EE79E66707B430C68EC914DE76B8474B606038133CA7EB2DEF85A90904770A09`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `task.fund`
- Explorer: https://testnet.xrpl.org/transactions/245F6D2DD2483771A7C3C0C409DB66E88B33212BF232AAD7ABE5D6DED104F458

### 3. NFTokenMint (task_nft_mint)

- Hash: `A1488F09BF0E5C16EF8C00925FB11320C603DD6BF458F44218A0414D198C10C8`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`
- URI: https://regulated-improvement-dose-closest.trycloudflare.com/tasks/task_tocrvmv90cv1ojpy.json
- Flags: 9
- Sequence: 21464749
- Fee: 12 drops
- Ledger: 21475047 (CTID C147AEE700020001), closed 2026-10-12T08:31:50Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `219F90B7F18F42CDA7539143EFEB1D5443A5D3839B611D563F8515E197F25CC640375A54ACFF5D38B469489ACEC9447E035854BE1CC25B84BE8A62BF3CDDFC07`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `task.mint`
- Explorer: https://testnet.xrpl.org/transactions/A1488F09BF0E5C16EF8C00925FB11320C603DD6BF458F44218A0414D198C10C8

### 4. NFTokenCreateOffer (task_offer)

- Hash: `7F6BFE30FD05CC1A28C813D0F10BEAB4205C38BE72C9634010B6A49DB8A10DA2`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Destination: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Amount: 1 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`
- Offer: `30C1E49E287E35E7AE41206F331811B5FFE06AF8328D534A92ADE0C4D07D2538`
- Flags: 1
- Sequence: 21464753
- Fee: 12 drops
- Ledger: 21475049 (CTID C147AEE900160001), closed 2026-10-12T08:32:00Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `E45037E9C101F1CC053CDEA74E79A526C95B2AD290B10096384D436E74A644601E9D4EAA89C32D6D22C3C6E03D0E76FD3FBA3FA3CB0476BB8088BC9A0229820D`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `task.offer`
- Explorer: https://testnet.xrpl.org/transactions/7F6BFE30FD05CC1A28C813D0F10BEAB4205C38BE72C9634010B6A49DB8A10DA2

### 5. NFTokenAcceptOffer (task_claim)

- Hash: `7DD95960D367A3FF716778579F76F83324861BCB7F122A68E4B9BB96EF207292`
- Signer: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Settles: $1.00 (the price of the accepted offer)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`
- Offer: `30C1E49E287E35E7AE41206F331811B5FFE06AF8328D534A92ADE0C4D07D2538`
- Flags: 0
- Sequence: 21464700
- Fee: 12 drops
- Ledger: 21475085 (CTID C147AF0D000D0001), closed 2026-10-12T08:34:01Z
- Result: `tesSUCCESS`
- Signing public key: `ED6DCF671661492EC87DB60AE9C8BCB62673D49D4CD8AFA0B42C634C3EC0121DF0`
- Signature: `9E3A9E93C07EC8FA48DC6DB685C28324868DE4F8BFB4AEE64A81EB076D86D117826300D7F84B47E6E370C982DC962B78DA0977FA453801313DA91F6F219E5E07`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `task.claim`
- Explorer: https://testnet.xrpl.org/transactions/7DD95960D367A3FF716778579F76F83324861BCB7F122A68E4B9BB96EF207292

### 6. Payment (subtask_funding)

- Hash: `25E2B77A271EF6ACFBFE91485B6502F63DE3EE48F2B13C11B6A5BFA11EB90CDC`
- Signer: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Delivered: 5.5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- Settles: $5.50 (the price of the accepted offer)
- Flags: 0
- Sequence: 21464701
- Fee: 12 drops
- Ledger: 21475087 (CTID C147AF0F00070001), closed 2026-10-12T08:34:10Z
- Result: `tesSUCCESS`
- Signing public key: `ED6DCF671661492EC87DB60AE9C8BCB62673D49D4CD8AFA0B42C634C3EC0121DF0`
- Signature: `51BB13E8D95C89A55B8C8FB04313166B824F9042396FBDAD6A8F8D0A7764122C8AA1DC1217898D61F52F3BB39C4A3A332ECF7E9425E3A65C9588491E08E5C10F`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/action` = `subtask.fund`
- Explorer: https://testnet.xrpl.org/transactions/25E2B77A271EF6ACFBFE91485B6502F63DE3EE48F2B13C11B6A5BFA11EB90CDC

### 7. NFTokenMint (subtask_nft_mint)

- Hash: `7D4EF37D4D082B7877F0B5FF640EFC3C2E57EA8ACAED57EF18CBA1A5C599BBFF`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`
- URI: https://regulated-improvement-dose-closest.trycloudflare.com/tasks/sub_m1eefzkvud77hgws.json
- Flags: 9
- Sequence: 21464764
- Fee: 12 drops
- Ledger: 21475089 (CTID C147AF1100100001), closed 2026-10-12T08:34:12Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `AEE05FCCA3E096A6E2CDAA06C2A1AF5F8EDBF9D05CB259DA2C734EB04FC0AB384567F40E18E9421704B79FE4375723E79A198D8A2408695A11DB6608D2FFDE0D`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/parent-nft` = `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`, `agent-pledge/action` = `subtask.mint`
- Explorer: https://testnet.xrpl.org/transactions/7D4EF37D4D082B7877F0B5FF640EFC3C2E57EA8ACAED57EF18CBA1A5C599BBFF

### 8. NFTokenCreateOffer (subtask_offer)

- Hash: `AA3F15B61B4EB0EF1985AE0D42F64AEC8B6D1F72F0CAE784D77BD5E936182A76`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Amount: 0 XRP (0 drops)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`
- Offer: `D24ABC3952F323EF03FC8F9AA43B0B8A8E27D61CF253AAEBA55FF4D66A0082EA`
- Flags: 1
- Sequence: 21464765
- Fee: 12 drops
- Ledger: 21475090 (CTID C147AF1200050001), closed 2026-10-12T08:34:20Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `BFF42D59D2CB3FCD2BE4355EDE882771E0CC22ED515EAA643BC4FC3FD29B7A15E7276F4A33F347DA8BEB7EA57F4E7A3C1F2BC3790AF6F05A0154B84143B8C206`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/action` = `subtask.offer`
- Explorer: https://testnet.xrpl.org/transactions/AA3F15B61B4EB0EF1985AE0D42F64AEC8B6D1F72F0CAE784D77BD5E936182A76

### 9. NFTokenAcceptOffer (subtask_claim)

- Hash: `92727484C16AA30623ABC51431FC0BB68F248D887E4F7F24CAB8E02B65936D14`
- Signer: helper `rNeoVmPNgr1LQM23q95RaXrN4Hr1E2PwSn`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`
- Offer: `D24ABC3952F323EF03FC8F9AA43B0B8A8E27D61CF253AAEBA55FF4D66A0082EA`
- Flags: 0
- Sequence: 21466247
- Fee: 12 drops
- Ledger: 21475143 (CTID C147AF4700030001), closed 2026-10-12T08:37:22Z
- Result: `tesSUCCESS`
- Signing public key: `ED45F4F82699718B8281547F914B3A48B56CF734919A0FABDAB95F863AC027DF7E`
- Signature: `3D7B2D08647FEBE200B3C15D7636ED486EF1D6F11FF198B51F0C9F8C7B6C4AD67CAFB7953EAD9DD79FD25B254E1340D5BD47293DB6B644AB581ACF8BDCD10105`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/action` = `subtask.claim`
- Explorer: https://testnet.xrpl.org/transactions/92727484C16AA30623ABC51431FC0BB68F248D887E4F7F24CAB8E02B65936D14

### 10. NFTokenCreateOffer (helper_redeem_offer)

- Hash: `F6F9C13D5F72E5A99CE23B5DD392602B9E9ED2D58FE127486199EAB0F9EF5629`
- Signer: helper `rNeoVmPNgr1LQM23q95RaXrN4Hr1E2PwSn`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Amount: 5.5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`
- Offer: `6D98BEC3622A12E237EC563D0DFF7F78E26111F127824F5E6C3CFD3F4AED8F92`
- Flags: 1
- Sequence: 21466248
- Fee: 12 drops
- Ledger: 21475198 (CTID C147AF7E00070001), closed 2026-10-12T08:40:40Z
- Result: `tesSUCCESS`
- Signing public key: `ED45F4F82699718B8281547F914B3A48B56CF734919A0FABDAB95F863AC027DF7E`
- Signature: `D078B814CD40A639E40CC083BB3ACBE9C2929456FA230DB56FEE48F6BBB93D1C785E86339C21F1D7567306B75FF97F503B0877ED416636355BB0DC03ACA3A20F`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/action` = `payout.offer`, `agent-pledge/proof` = `9fbfec02207457bbc28f545fb78ed5b213f305503ff90aebae77c642af5a6818`
- Explorer: https://testnet.xrpl.org/transactions/F6F9C13D5F72E5A99CE23B5DD392602B9E9ED2D58FE127486199EAB0F9EF5629

### 11. NFTokenAcceptOffer (helper_payout)

- Hash: `A7DA8F81E9C9F8E0A67DD616292F3B2C73072C9868C424D36A794B18BF8569EF`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Settles: $5.50 (the price of the accepted offer)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`
- Offer: `6D98BEC3622A12E237EC563D0DFF7F78E26111F127824F5E6C3CFD3F4AED8F92`
- Flags: 0
- Sequence: 21464766
- Fee: 12 drops
- Ledger: 21475199 (CTID C147AF7F000C0001), closed 2026-10-12T08:40:41Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `3645CCB634481007435358172A3E8E9196B98A9DD7D6A1C798BD0FF7E6D0950E4C5133690A62A781D0FB1FEC674D89F6D5120138925F26EF91111C8D124C720D`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/action` = `payout.accept`, `agent-pledge/proof` = `9fbfec02207457bbc28f545fb78ed5b213f305503ff90aebae77c642af5a6818`
- Explorer: https://testnet.xrpl.org/transactions/A7DA8F81E9C9F8E0A67DD616292F3B2C73072C9868C424D36A794B18BF8569EF

### 12. NFTokenBurn (subtask_nft_burn)

- Hash: `FE62CF9C07C627646F0AD55938E1BC02B34FF51069B6DBD8D218218287A31C4C`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`
- Flags: 0
- Sequence: 21464767
- Fee: 12 drops
- Ledger: 21475201 (CTID C147AF8100100001), closed 2026-10-12T08:40:50Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `D89699890FA72A87E3936396D767A0B065C649D1B9B59AA73C868E31655E21B1501BB6F0A2B1CF31E24502D5B0C02C8B901651AB68968C0CA663B03647C7E205`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/subtask` = `sub_m1eefzkvud77hgws`, `agent-pledge/action` = `nft.burn`
- Explorer: https://testnet.xrpl.org/transactions/FE62CF9C07C627646F0AD55938E1BC02B34FF51069B6DBD8D218218287A31C4C

### 13. NFTokenCreateOffer (agent_redeem_offer)

- Hash: `16F66D3C05F29888CBD6FF47FBA21EEF21F80D7524E962AA1E70C3BE55440DFD`
- Signer: local agent `rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg`
- Destination: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Amount: 8 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`
- Offer: `9890F3BF3AD1786D3EF98AD5881785BECE083F292419C162E01273EDC4CBBE42`
- Flags: 1
- Sequence: 21464702
- Fee: 12 drops
- Ledger: 21475203 (CTID C147AF8300110001), closed 2026-10-12T08:41:00Z
- Result: `tesSUCCESS`
- Signing public key: `ED6DCF671661492EC87DB60AE9C8BCB62673D49D4CD8AFA0B42C634C3EC0121DF0`
- Signature: `79AAB0E31C8A5F51F9AF49BA48D08B909FF3917F267C77A47A5E4AADC5D9E99E9EB9D5E63CA2F9ADE62C87A3C86B1051575427132523600C731EBD1CD12C290F`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `payout.offer`
- Explorer: https://testnet.xrpl.org/transactions/16F66D3C05F29888CBD6FF47FBA21EEF21F80D7524E962AA1E70C3BE55440DFD

### 14. NFTokenAcceptOffer (agent_payout)

- Hash: `EEF998D589BC67ED1896F9A036BDF5BBFC10618E993846D48D14AE5689978B88`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- Settles: $8.00 (the price of the accepted offer)
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`
- Offer: `9890F3BF3AD1786D3EF98AD5881785BECE083F292419C162E01273EDC4CBBE42`
- Flags: 0
- Sequence: 21464768
- Fee: 12 drops
- Ledger: 21475205 (CTID C147AF8500060001), closed 2026-10-12T08:41:02Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `2C7028E305EEDDE23633485A6C1295A9939D1359D469A21ADA7EDA69AD195E2E46C43D2BD4500D5588165FFF6AD0724065C5FDF6816678E596C6FFB76418E904`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `payout.accept`
- Explorer: https://testnet.xrpl.org/transactions/EEF998D589BC67ED1896F9A036BDF5BBFC10618E993846D48D14AE5689978B88

### 15. NFTokenBurn (task_nft_burn)

- Hash: `CD2DE5A40E3AB62814FEC6F6A6570FDAE7585B0F16F1C1C4F4534CE99E39ABA9`
- Signer: vault `r37hDaqXGUL574V8y91XSoktYDpc9HpPjN`
- NFT: `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`
- Flags: 0
- Sequence: 21464769
- Fee: 12 drops
- Ledger: 21475207 (CTID C147AF8700080001), closed 2026-10-12T08:41:11Z
- Result: `tesSUCCESS`
- Signing public key: `EDCFC2904B90E57C2F97DF53149A632EE40F10D81D2918B6B413F3376AF7093FB4`
- Signature: `5F154CFB4E70C276CB1F85FD293CB2A8C8EE3424A7711A1B7BD2B8DB56272F1EE8F053E2DDFD607E6446DCBE01E655387550F038487D9B1C752B0C12BF4ACC03`
- Memos: `agent-pledge/task` = `task_tocrvmv90cv1ojpy`, `agent-pledge/action` = `nft.burn`
- Explorer: https://testnet.xrpl.org/transactions/CD2DE5A40E3AB62814FEC6F6A6570FDAE7585B0F16F1C1C4F4534CE99E39ABA9

## The NFTs

### Task NFT `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675`

Explorer: https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675

- NFTokenMint by vault: [A1488F09…198C10C8](https://testnet.xrpl.org/transactions/A1488F09BF0E5C16EF8C00925FB11320C603DD6BF458F44218A0414D198C10C8)
- NFTokenCreateOffer by vault: [7F6BFE30…B8A10DA2](https://testnet.xrpl.org/transactions/7F6BFE30FD05CC1A28C813D0F10BEAB4205C38BE72C9634010B6A49DB8A10DA2)
- NFTokenAcceptOffer by local agent: [7DD95960…EF207292](https://testnet.xrpl.org/transactions/7DD95960D367A3FF716778579F76F83324861BCB7F122A68E4B9BB96EF207292)
- NFTokenCreateOffer by local agent: [16F66D3C…55440DFD](https://testnet.xrpl.org/transactions/16F66D3C05F29888CBD6FF47FBA21EEF21F80D7524E962AA1E70C3BE55440DFD)
- NFTokenAcceptOffer by vault: [EEF998D5…89978B88](https://testnet.xrpl.org/transactions/EEF998D589BC67ED1896F9A036BDF5BBFC10618E993846D48D14AE5689978B88)
- NFTokenBurn by vault: [CD2DE5A4…9E39ABA9](https://testnet.xrpl.org/transactions/CD2DE5A40E3AB62814FEC6F6A6570FDAE7585B0F16F1C1C4F4534CE99E39ABA9)

URI data (`/tasks/task_tocrvmv90cv1ojpy.json`):

```json
{
  "id": "task_tocrvmv90cv1ojpy",
  "kind": "task",
  "description": "Deliver me a peach-flavored Ghost energy drink",
  "place": "1234 Main St, Berkeley CA",
  "price": "7.00",
  "deadline": "2026-10-12T12:31:15.591Z",
  "status": "done",
  "nft_id": "0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675",
  "parent_task_id": null,
  "parent_nft_id": null,
  "board_url": "https://www.yopledge.site/?task=task_tocrvmv90cv1ojpy"
}
```

### Sub-task NFT `0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B`

Explorer: https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B

- NFTokenMint by vault: [7D4EF37D…C599BBFF](https://testnet.xrpl.org/transactions/7D4EF37D4D082B7877F0B5FF640EFC3C2E57EA8ACAED57EF18CBA1A5C599BBFF)
- NFTokenCreateOffer by vault: [AA3F15B6…36182A76](https://testnet.xrpl.org/transactions/AA3F15B61B4EB0EF1985AE0D42F64AEC8B6D1F72F0CAE784D77BD5E936182A76)
- NFTokenAcceptOffer by helper: [92727484…65936D14](https://testnet.xrpl.org/transactions/92727484C16AA30623ABC51431FC0BB68F248D887E4F7F24CAB8E02B65936D14)
- NFTokenCreateOffer by helper: [F6F9C13D…F9EF5629](https://testnet.xrpl.org/transactions/F6F9C13D5F72E5A99CE23B5DD392602B9E9ED2D58FE127486199EAB0F9EF5629)
- NFTokenAcceptOffer by vault: [A7DA8F81…BF8569EF](https://testnet.xrpl.org/transactions/A7DA8F81E9C9F8E0A67DD616292F3B2C73072C9868C424D36A794B18BF8569EF)
- NFTokenBurn by vault: [FE62CF9C…87A31C4C](https://testnet.xrpl.org/transactions/FE62CF9C07C627646F0AD55938E1BC02B34FF51069B6DBD8D218218287A31C4C)

URI data (`/tasks/sub_m1eefzkvud77hgws.json`):

```json
{
  "id": "sub_m1eefzkvud77hgws",
  "kind": "subtask",
  "description": "Deliver me a peach-flavored Ghost energy drink",
  "place": "1234 Main St, Berkeley CA",
  "price": "5.50",
  "deadline": "2026-10-12T12:31:15.591Z",
  "status": "done",
  "nft_id": "0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4418FB140147867B",
  "parent_task_id": "task_tocrvmv90cv1ojpy",
  "parent_nft_id": "0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDBAB6151101478675",
  "board_url": "https://www.yopledge.site/?task=task_tocrvmv90cv1ojpy"
}
```

## Final balances

| Role | Address | XRP | Tokens | NFTs held |
|---|---|---|---|---|
| vault | [r37hDaqXGUL574V8y91XSoktYDpc9HpPjN](https://testnet.xrpl.org/accounts/r37hDaqXGUL574V8y91XSoktYDpc9HpPjN) | 99.998788 | 77.5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478679](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD164D591601478679), [00090000…0147867A](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD2D332A170147867A), [00090000…01478676](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDD19BE61301478676), [00090000…01478677](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDE881B71001478677), [00090000…01478678](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDFF67881101478678) |
| local agent | [rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg](https://testnet.xrpl.org/accounts/rpRVQjEZW5a31V7imzBfng8yxTKPgQZFZg) | 99.999592 | 60 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | [00090000…01478670](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD4839000A01478670), [00090000…01478671](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD5F1ED10D01478671), [00090000…01478672](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD7604A20C01478672), [00090000…01478673](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFD8CEA730F01478673), [00090000…01478674](https://testnet.xrpl.org/nft/0009000051E6CA35EFA0073E1A0E033047455779DEB5BBFDA3D0440E01478674) |
| treasury | [rDL6eSZQm3RMxdNQCEQtbKtjGNFN3K8e8W](https://testnet.xrpl.org/accounts/rDL6eSZQm3RMxdNQCEQtbKtjGNFN3K8e8W) | 99.999796 | 190 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |
| requester | [rBSSq1ZKWbjhF5wxzYWzFVygiWfyQqLxeg](https://testnet.xrpl.org/accounts/rBSSq1ZKWbjhF5wxzYWzFVygiWfyQqLxeg) | 99.999976 | 0 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |
| helper | [rNeoVmPNgr1LQM23q95RaXrN4Hr1E2PwSn](https://testnet.xrpl.org/accounts/rNeoVmPNgr1LQM23q95RaXrN4Hr1E2PwSn) | 99.999964 | 5.5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT) | none |

The vault holds no NFT at the end, so both tasks are closed.
The helper and the agent hold none either, because the payout swap moved each NFT back to the vault before the burn.

## Media

- Helper photo: [sub_m1eefzkvud77hgws-photo.jpg](sub_m1eefzkvud77hgws-photo.jpg) (served at https://consideration-auditor-equations-think.trycloudflare.com/media/med_d8ekf39v12nhz08q)
- Yik Yak post: [sub_m1eefzkvud77hgws-yikyak.jpg](sub_m1eefzkvud77hgws-yikyak.jpg) (served at https://consideration-auditor-equations-think.trycloudflare.com/media/med_1iovel13uci9v3sf)
