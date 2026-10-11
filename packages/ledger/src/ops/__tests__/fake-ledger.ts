import { decode, hashes, RippledError, type Client } from "xrpl";
import { loadConfig, type LedgerConfig } from "../../config.js";

export type Tx = Record<string, unknown> & { TransactionType: string; Account: string };

interface Offer {
  nftId: string;
  owner: string;
  amount: unknown;
  destination?: string | undefined;
}

interface Entry {
  hash: string;
  tx_json: Tx;
  meta: Record<string, unknown> & { TransactionResult: string };
  validated: true;
}

const hex64 = (prefix: string, n: number) =>
  (prefix + n.toString(16)).toUpperCase().padStart(64, "0");

/**
 * An in-memory XRPL behind the client methods that the core submitTx and the ops use:
 * isConnected, autofill, getLedgerIndex, and request (submit, tx, account_tx, account_nfts,
 * nft_sell_offers, ledger_entry for offers). No network.
 *
 * - Submitted blobs are decoded, so tests inspect the real signed transactions (`submitted`).
 * - Like rippled, a submit applies the transaction to the state at once (the open ledger), but it
 *   joins the account_tx history only when the `tx` poll sees it validated.
 * - Mints make NFTs, offers are stored, accepts move NFTs, burns delete them and their offers.
 *   A burn with the wrong Owner is tecNO_ENTRY. An accept of a missing offer is tecOBJECT_NOT_FOUND.
 * - account_tx returns entries newest first in API v2 shape (Payment has DeliverMax, the meta has
 *   delivered_amount), and pages with a marker when there are more than `maxPageSize`.
 * - Every account passed to `createAccount` gets a creation payment at the start of its history.
 */
export class FakeLedger {
  readonly config: LedgerConfig;
  holders = new Map<string, string>();
  offers = new Map<string, Offer>();
  history: Entry[] = [];
  submitted: Tx[] = [];
  /** Engine results to force for the next submits, in order. Effects are skipped for non-tes. */
  nextResults: string[] = [];
  /** Runs before each submit is applied. Tests use it to make another party act first. */
  beforeSubmit: ((tx: Tx) => void) | undefined;
  /** Largest account_tx page. Smaller values force paging. */
  maxPageSize = 200;
  accountTxRequests = 0;

  private counter = 0;
  private ledgerIndex = 100;
  private pending = new Map<string, Entry>();

  constructor(config?: LedgerConfig) {
    this.config = config ?? loadConfig({} as NodeJS.ProcessEnv);
  }

  readonly client = {
    isConnected: () => true,
    getLedgerIndex: async () => this.ledgerIndex,
    autofill: async (tx: Tx) => ({
      ...tx,
      Fee: "12",
      Sequence: ++this.counter,
      LastLedgerSequence: this.ledgerIndex + 20,
    }),
    request: async (req: Record<string, unknown> & { command: string }) => {
      switch (req.command) {
        case "submit":
          return this.submit(String(req.tx_blob));
        case "tx": {
          const hash = String(req.transaction);
          const old = this.history.find((e) => e.hash === hash);
          if (old) {
            // Already validated: the port's verifyTx reads it again.
            return { result: { ...old.tx_json, hash, validated: true, meta: old.meta } };
          }
          const entry = this.pending.get(hash);
          if (!entry) throw new RippledError("txnNotFound", { error: "txnNotFound" });
          this.pending.delete(hash);
          this.history.push(entry);
          this.ledgerIndex++;
          return {
            result: {
              ...entry.tx_json,
              hash,
              validated: true,
              ledger_index: this.ledgerIndex,
              meta: entry.meta,
            },
          };
        }
        case "account_tx":
          return this.accountTx(req);
        case "account_nfts": {
          const nfts = [...this.holders]
            .filter(([, owner]) => owner === req.account)
            .map(([NFTokenID]) => ({ NFTokenID }));
          return { result: { account_nfts: nfts } };
        }
        case "nft_sell_offers": {
          const offers = [...this.offers]
            .filter(([, o]) => o.nftId === req.nft_id)
            .map(([index, o]) => ({
              nft_offer_index: index,
              owner: o.owner,
              amount: o.amount,
              flags: 1,
              ...(o.destination ? { destination: o.destination } : {}),
            }));
          if (offers.length === 0) {
            throw new RippledError("objectNotFound", { error: "objectNotFound" });
          }
          return { result: { nft_id: req.nft_id, offers } };
        }
        case "ledger_entry": {
          const offer = this.offers.get(String(req.index));
          if (!offer) throw new RippledError("entryNotFound", { error: "entryNotFound" });
          return {
            result: {
              index: req.index,
              node: {
                LedgerEntryType: "NFTokenOffer",
                NFTokenID: offer.nftId,
                Owner: offer.owner,
                Amount: offer.amount,
                Flags: 1,
                ...(offer.destination ? { Destination: offer.destination } : {}),
              },
            },
          };
        }
        default:
          throw new Error(`unexpected ${req.command}`);
      }
    },
  };

  get ctx() {
    return { client: this.client as unknown as Client, config: this.config, pollIntervalMs: 1 };
  }

  /** Adds the faucet payment that created the account, as the first entry of its history. */
  createAccount(address: string): void {
    this.history.unshift(
      this.entry(
        `CREATE${++this.counter}`,
        {
          TransactionType: "Payment",
          Account: "rFaucet",
          Destination: address,
          Amount: "100000000",
        },
        {
          TransactionResult: "tesSUCCESS",
          delivered_amount: "100000000",
          AffectedNodes: [
            { CreatedNode: { LedgerEntryType: "AccountRoot", NewFields: { Account: address } } },
          ],
        },
      ),
    );
  }

  /**
   * Applies a transaction from another process or party right now, as validated, without going
   * through submit. Returns the meta.
   */
  external(tx: Tx): Record<string, unknown> {
    const meta = this.apply(tx, undefined);
    this.history.push(this.entry(`EXT${++this.counter}`, tx, meta));
    return meta;
  }

  /** Records a validated transaction with the given meta, without effects on the state. */
  seed(tx: Tx, meta: Record<string, unknown> = {}): void {
    this.history.push(
      this.entry(`SEED${++this.counter}`, tx, { TransactionResult: "tesSUCCESS", ...meta }),
    );
  }

  private entry(id: string, tx: Tx, meta: Record<string, unknown>): Entry {
    // API v2 shape: Payment's Amount is DeliverMax in tx_json.
    const { Amount, ...rest } = tx;
    const txJson = (tx.TransactionType === "Payment" ? { ...rest, DeliverMax: Amount } : tx) as Tx;
    return {
      hash: id.length === 64 ? id : id.padEnd(64, "0"),
      tx_json: txJson,
      meta: meta as Entry["meta"],
      validated: true,
    };
  }

  private submit(txBlob: string) {
    const tx = decode(txBlob) as unknown as Tx;
    this.submitted.push(tx);
    this.beforeSubmit?.(tx);
    const meta = this.apply(tx, this.nextResults.shift());
    const hash = hashes.hashSignedTx(txBlob);
    this.pending.set(hash, this.entry(hash, tx, meta));
    return { result: { engine_result: meta.TransactionResult } };
  }

  /** Applies the effects of a transaction and returns its meta. */
  private apply(
    tx: Tx,
    forced: string | undefined,
  ): Record<string, unknown> & {
    TransactionResult: string;
  } {
    if (forced && forced !== "tesSUCCESS") return { TransactionResult: forced };
    const fail = (code: string) => ({ TransactionResult: code });
    const ok = (extra: Record<string, unknown> = {}) => ({
      TransactionResult: "tesSUCCESS",
      ...extra,
    });
    const n = ++this.counter;
    switch (tx.TransactionType) {
      case "Payment":
        return ok({ delivered_amount: tx.Amount });
      case "NFTokenMint": {
        const nftId = hex64("0009", n);
        this.holders.set(nftId, tx.Account);
        if (tx.Amount === undefined) return ok({ nftoken_id: nftId });
        const offerId = hex64("0FF", n);
        this.offers.set(offerId, {
          nftId,
          owner: tx.Account,
          amount: tx.Amount,
          destination: tx.Destination as string | undefined,
        });
        return ok({ nftoken_id: nftId, offer_id: offerId });
      }
      case "NFTokenCreateOffer": {
        const nftId = String(tx.NFTokenID);
        if (this.holders.get(nftId) !== tx.Account) return fail("tecNO_ENTRY");
        const offerId = hex64("0FF", n);
        this.offers.set(offerId, {
          nftId,
          owner: tx.Account,
          amount: tx.Amount,
          destination: tx.Destination as string | undefined,
        });
        return ok({ offer_id: offerId });
      }
      case "NFTokenAcceptOffer": {
        const offerId = String(tx.NFTokenSellOffer);
        const offer = this.offers.get(offerId);
        if (!offer) return fail("tecOBJECT_NOT_FOUND");
        if (offer.destination && offer.destination !== tx.Account) return fail("tecNO_PERMISSION");
        if (this.holders.get(offer.nftId) !== offer.owner) return fail("tecNO_ENTRY");
        this.offers.delete(offerId);
        this.holders.set(offer.nftId, tx.Account);
        return ok({ nftoken_id: offer.nftId });
      }
      case "NFTokenBurn": {
        const nftId = String(tx.NFTokenID);
        const owner = (tx.Owner as string | undefined) ?? tx.Account;
        if (this.holders.get(nftId) !== owner) return fail("tecNO_ENTRY");
        this.holders.delete(nftId);
        for (const [id, offer] of this.offers) if (offer.nftId === nftId) this.offers.delete(id);
        return ok();
      }
      default:
        return ok();
    }
  }

  private accountTx(req: Record<string, unknown>) {
    this.accountTxRequests++;
    const all = [...this.history].reverse();
    const start = typeof req.marker === "number" ? req.marker : 0;
    const limit = Math.min(Number(req.limit ?? 200), this.maxPageSize);
    const page = all.slice(start, start + limit);
    const next = start + limit;
    return {
      result: {
        transactions: page,
        ...(next < all.length ? { marker: next } : {}),
      },
    };
  }
}
