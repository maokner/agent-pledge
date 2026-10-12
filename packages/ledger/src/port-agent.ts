/**
 * createAgentLedger: the local agent's AgentLedger (packages/shared/src/ledger.ts). The agent signs
 * on the laptop with its own seed and sends only the hashes to the server, which checks them with
 * LedgerPort.verifyTx (docs/api.md section 6).
 */
import type {
  AcceptTxResult,
  AgentLedger,
  AgentLedgerOptions,
  Money,
  OfferTxResult,
  TxContext,
  TxListener,
  TxResult,
} from "@agent-pledge/shared";
import type { Wallet } from "xrpl";
import { disconnect, getClient } from "./client.js";
import { explorerTxUrl as configExplorerTxUrl } from "./explorer.js";
import { acceptOffer } from "./ops/claim.js";
import type { OpsContext } from "./ops/context.js";
import { createPayoutOffer } from "./ops/payout.js";
import { fundSubtask } from "./ops/subtask.js";
import { TxForwarder, type EventInfo } from "./port-events.js";
import { fromMoney, toMoney } from "./port-map.js";
import { configFromOptions, contractErrors, memoTaskId, single } from "./port.js";
import { walletFromSeed } from "./wallet.js";

export class XrplAgentLedger implements AgentLedger {
  readonly address: string;
  private readonly events: TxForwarder;

  constructor(
    private readonly c: OpsContext,
    private readonly agent: Wallet,
    private readonly vaultAddress: string,
    private readonly ownsClient = false,
  ) {
    this.address = agent.classicAddress;
    this.events = new TxForwarder((hash) => configExplorerTxUrl(this.c.config, hash));
  }

  onTx(listener: TxListener): () => void {
    return this.events.onTx(listener);
  }

  async close(): Promise<void> {
    this.events.close();
    if (this.ownsClient) await disconnect();
  }

  private result(hash: string, info: EventInfo): TxResult {
    return {
      hash,
      kind: info.kind,
      explorerUrl: configExplorerTxUrl(this.c.config, hash),
      ...(info.amount !== undefined ? { amount: info.amount } : {}),
      ...(info.from !== undefined ? { from: info.from } : {}),
      ...(info.to !== undefined ? { to: info.to } : {}),
    };
  }

  /** Claim: accept the vault's sell offer, which pays the pledge in the same transaction. */
  async acceptOffer(offerId: string, ctx?: TxContext): Promise<AcceptTxResult> {
    const info: EventInfo = {
      kind: "task_claim",
      taskId: ctx?.taskId,
      from: this.address,
      to: this.vaultAddress,
      offerId,
    };
    const claim = await this.events.run(
      single(info),
      () =>
        acceptOffer(
          { claimer: this.agent, offerId, kind: "task.claim", taskId: memoTaskId(ctx?.taskId) },
          this.c,
        ),
      (r) => ({ nftId: r.nftId }),
    );
    return { ...this.result(claim.hash, info), nftId: claim.nftId, holder: claim.holder };
  }

  /** Payment agent -> vault with the sub-task (and task) memos. */
  async fundSubtask(subtaskRef: string, amount: Money, ctx?: TxContext): Promise<TxResult> {
    const taskId = ctx?.taskId ?? subtaskRef;
    const info: EventInfo = {
      kind: "subtask_funding",
      taskId: ctx?.taskId,
      subtaskId: subtaskRef,
      amount: toMoney(fromMoney(amount)),
      from: this.address,
      to: this.vaultAddress,
    };
    const tx = await this.events.run(single(info), () =>
      fundSubtask(
        {
          agent: this.agent,
          vault: this.vaultAddress,
          amount: fromMoney(amount),
          subtaskId: subtaskRef,
          taskId,
        },
        this.c,
      ),
    );
    return this.result(tx.hash, info);
  }

  /** Redeem: sell the task NFT to the vault for price + pledge. */
  async createRedeemOffer(nftId: string, amount: Money, ctx?: TxContext): Promise<OfferTxResult> {
    const info: EventInfo = {
      kind: "agent_redeem_offer",
      taskId: ctx?.taskId,
      amount: toMoney(fromMoney(amount)),
      from: this.address,
      to: this.vaultAddress,
      nftId,
    };
    const offer = await this.events.run(
      single(info),
      () =>
        createPayoutOffer(
          {
            holder: this.agent,
            vaultAddress: this.vaultAddress,
            nftId,
            amount: fromMoney(amount),
            taskId: ctx?.taskId,
            proofSha256: ctx?.proofSha256,
          },
          this.c,
        ),
      (r) => ({ offerId: r.offerId }),
    );
    return { ...this.result(offer.hash, info), offerId: offer.offerId, nftId };
  }
}

/** Laptop side: the agent's own transactions. See packages/shared/src/ledger.ts. */
export async function createAgentLedger(options: AgentLedgerOptions): Promise<AgentLedger> {
  const config = configFromOptions(options);
  const agent = walletFromSeed(options.agentSeed);
  const client = await contractErrors(() => getClient(config));
  return new XrplAgentLedger({ client, config }, agent, options.vaultAddress, true);
}
