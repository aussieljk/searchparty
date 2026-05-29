// ============================================================================
// SOCIAL CARD SIMULATOR — per-page detail section. Renders pixel-shaped share
// previews for Google, X, Facebook, LinkedIn, Slack, iMessage and Discord, with
// each platform's real truncation lengths and inline warnings.
// ============================================================================
import { AlertTriangle, Share2, XCircle } from "lucide-react";
import { useState } from "react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { FeatureDetail } from "@/features/registry";
import type { PageResult } from "@/types";
import {
  DiscordCard,
  FacebookCard,
  GoogleCard,
  IMessageCard,
  LinkedInCard,
  SlackCard,
  TwitterCard,
} from "./cards";
import { type Platform, PLATFORMS, warningsFor } from "./lib";

const CARDS: Record<Platform, (p: { page: PageResult }) => React.JSX.Element> = {
  google: GoogleCard,
  twitter: TwitterCard,
  facebook: FacebookCard,
  linkedin: LinkedInCard,
  slack: SlackCard,
  imessage: IMessageCard,
  discord: DiscordCard,
};

function SocialCardsDetail({ page }: { page: PageResult }) {
  const [platform, setPlatform] = useState<Platform>("google");
  if (page.error) return null;

  const Card = CARDS[platform];
  const warnings = warningsFor(platform, page);

  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <Share2 size={13} />
        Social card simulator
      </h4>

      <ToggleGroup
        className="flex-wrap"
        value={[platform]}
        onValueChange={(v) => {
          const next = v[0] as Platform | undefined;
          if (next) setPlatform(next);
        }}
        multiple={false}
        variant="outline"
        size="sm"
      >
        {PLATFORMS.map((p) => (
          <ToggleGroupItem key={p.id} value={p.id} aria-label={p.label}>
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex justify-center overflow-x-auto rounded-xl border bg-muted/30 px-3 py-6">
        <Card page={page} />
      </div>

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {warnings.map((warn) => (
            <li
              key={warn.text}
              className={`flex items-start gap-1.5 text-xs ${
                warn.level === "error" ? "text-destructive-foreground" : "text-warning-foreground"
              }`}
            >
              {warn.level === "error" ? (
                <XCircle size={13} className="mt-px shrink-0" />
              ) : (
                <AlertTriangle size={13} className="mt-px shrink-0" />
              )}
              <span>{warn.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          No issues for this platform — title, description and image fit cleanly.
        </p>
      )}
    </section>
  );
}

export const detail: FeatureDetail = {
  id: "social-cards",
  order: 20,
  Component: SocialCardsDetail,
};
