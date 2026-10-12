import { CAST, ACCOUNTS, tokenBalance } from "@/lib/demo/walkthrough";
import { ExplorerLink, Hash, RoleChip, SectionHeading } from "./parts";

/** Every account at the end of the run, as read from the ledger. */
export function Balances() {
  const rows = CAST.map((member) => ({
    member,
    account: ACCOUNTS.find((a) => a.role === member.role)!,
  }));
  return (
    <section
      id="balances"
      aria-labelledby="balances-title"
      className="scroll-mt-28 flex flex-col gap-10"
    >
      <SectionHeading
        id="balances-title"
        badge="Final balances"
        title={
          <>
            Nobody holds an NFT, <span className="text-human-gradient">everyone was paid</span>
          </>
        }
        lede="Read from the ledger after the last burn. The vault's $1.00 is from an earlier run; this task left it with nothing."
      />
      <div className="overflow-x-auto rounded-2xl border border-human-border bg-human-card shadow-human-md">
        <table className="w-full min-w-[40rem] text-left text-base">
          <thead>
            <tr className="border-b border-human-border text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
              <th scope="col" className="px-5 py-4 font-medium">
                Account
              </th>
              <th scope="col" className="px-5 py-4 font-medium">
                Address
              </th>
              <th scope="col" className="px-5 py-4 text-right font-medium">
                Dollars
              </th>
              <th scope="col" className="px-5 py-4 text-right font-medium">
                XRP
              </th>
              <th scope="col" className="px-5 py-4 text-right font-medium">
                NFTs held
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-human-border">
            {rows.map(({ member, account }) => (
              <tr key={member.role}>
                <th scope="row" className="px-5 py-4 font-medium">
                  <RoleChip role={member.role} />
                </th>
                <td className="px-5 py-4">
                  <ExplorerLink href={account.explorerUrl} className="min-h-0 text-sm">
                    <Hash value={account.address} />
                  </ExplorerLink>
                </td>
                <td className="px-5 py-4 text-right font-semibold tabular-nums">
                  {tokenBalance(account.tokens)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-human-muted-fg">
                  {account.xrp}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {account.nfts.length === 0 ? "none" : account.nfts.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
