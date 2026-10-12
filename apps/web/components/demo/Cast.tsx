import { Card } from "@/components/human/Card";
import { IconTile } from "@/components/human/IconTile";
import { cn } from "@/lib/cn";
import { CAST, type Cast as CastMember } from "@/lib/demo/walkthrough";
import { formatSignedRlusd } from "@/lib/format";
import { ExplorerLink, Hash, ROLE_ICON, SectionHeading } from "./parts";

/** The five accounts in the run, with what each one did and how its money changed. */
export function Cast() {
  const story = CAST.filter((c) => c.net !== null);
  const setup = CAST.filter((c) => c.net === null);
  return (
    <section id="cast" aria-labelledby="cast-title" className="scroll-mt-28 flex flex-col gap-10">
      <SectionHeading
        id="cast-title"
        badge="Who's who"
        title={
          <>
            Four wallets, <span className="text-human-gradient">one job</span>
          </>
        }
        lede="Each account signs its own transactions. The vault never holds a key for anyone else."
      />
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {story.map((member) => (
          <CastCard key={member.role} member={member} />
        ))}
      </ul>
      {setup.map((member) => (
        <Card
          key={member.role}
          as="div"
          variant="muted"
          padding="sm"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5"
        >
          <span className="text-base font-semibold">{member.name}</span>
          <span className="text-base text-human-fg/80">{member.blurb}</span>
          <ExplorerLink href={member.explorerUrl} className="ml-auto min-h-0 text-sm">
            <Hash value={member.address} />
          </ExplorerLink>
        </Card>
      ))}
    </section>
  );
}

function CastCard({ member }: { member: CastMember }) {
  const Icon = ROLE_ICON[member.role];
  const net = Number(member.net);
  return (
    <Card
      as="li"
      className="group/card flex flex-col gap-5 transition-all duration-300 ease-human hover:shadow-human-xl motion-safe:hover:-translate-y-1"
    >
      <div className="flex items-start justify-between gap-4">
        <IconTile size="md" className="motion-safe:group-hover/card:scale-110">
          <Icon />
        </IconTile>
        <p className="flex flex-col items-end gap-1 text-right">
          <span className="text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
            Net
          </span>
          <span
            className={cn(
              "text-2xl font-bold leading-none tracking-[-0.02em] tabular-nums",
              net > 0 ? "text-human-success" : net < 0 ? "text-human-fg" : "text-human-muted-fg",
            )}
          >
            {formatSignedRlusd(member.net ?? "0")}
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold leading-snug tracking-[-0.01em]">{member.name}</h3>
        <p className="text-base leading-relaxed text-human-muted-fg">{member.blurb}</p>
      </div>
      <ExplorerLink href={member.explorerUrl} className="mt-auto min-h-0 text-sm">
        <Hash value={member.address} />
      </ExplorerLink>
    </Card>
  );
}
