// Pixel-shaped share-preview cards. Each component lays out title/description/
// image/domain the way the real platform does, with that platform's truncation.
import { ImageOff } from "lucide-react";
import type { PageResult } from "@/types";
import {
  breadcrumb,
  cardData,
  fullPathDisplay,
  hostOf,
  truncate,
} from "./lib";

/** Shared image slot with a graceful "no image" placeholder. */
function CardImage({
  src,
  className,
  alt = "",
}: {
  src?: string;
  className?: string;
  alt?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600 ${className ?? ""}`}
      >
        <ImageOff size={20} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className ?? ""}`}
      loading="lazy"
    />
  );
}

// ---------------------------------------------------------------------------
// Google SERP — light card, blue title, green breadcrumb. No image inline.
// ---------------------------------------------------------------------------
export function GoogleCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const title = truncate(d.title || fullPathDisplay(page.finalUrl), 60);
  const desc = truncate(d.description || "", 160);
  return (
    <div
      className="max-w-[600px] rounded-lg bg-white p-4 text-left shadow-sm dark:bg-[#202124]"
      style={{ fontFamily: "arial, sans-serif" }}
    >
      <div className="flex items-center gap-2">
        {page.favicon ? (
          <img
            src={page.favicon}
            alt=""
            className="size-6 rounded-full border border-neutral-200 bg-white p-0.5 dark:border-neutral-700"
          />
        ) : (
          <div className="size-6 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        )}
        <div className="leading-tight">
          <div className="text-[14px] text-[#202124] dark:text-[#dadce0]">
            {hostOf(page.finalUrl)}
          </div>
          <div className="text-[12px] text-[#4d5156] dark:text-[#bdc1c6]">
            {breadcrumb(page.finalUrl)}
          </div>
        </div>
      </div>
      <div className="mt-1 text-[20px] text-[#1a0dab] leading-[1.3] hover:underline dark:text-[#8ab4f8]">
        {title}
      </div>
      {desc && (
        <div className="mt-1 text-[14px] text-[#4d5156] leading-[1.58] dark:text-[#bdc1c6]">
          {desc}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// X / Twitter — summary_large_image (16:9 above) vs summary (square left).
// ---------------------------------------------------------------------------
export function TwitterCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const large = d.card === "summary_large_image";
  const title = truncate(d.title, 70);
  const desc = truncate(d.description, 200);

  if (large) {
    return (
      <div className="max-w-[510px] overflow-hidden rounded-2xl border border-[#2f3336] bg-black text-left text-white">
        <CardImage src={d.image} className="aspect-[1.91/1] w-full" />
        <div className="px-3 py-2.5">
          <div className="text-[15px] text-[#71767b] lowercase">{d.host}</div>
          <div className="mt-0.5 line-clamp-1 text-[15px] text-white">{title}</div>
          {desc && (
            <div className="mt-0.5 line-clamp-2 text-[15px] text-[#71767b]">{desc}</div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[510px] overflow-hidden rounded-2xl border border-[#2f3336] bg-black text-left text-white">
      <CardImage src={d.image} className="aspect-square w-[130px] shrink-0" />
      <div className="flex flex-col justify-center px-3 py-2.5">
        <div className="text-[15px] text-[#71767b] lowercase">{d.host}</div>
        <div className="mt-0.5 line-clamp-1 text-[15px] text-white">{title}</div>
        {desc && (
          <div className="mt-0.5 line-clamp-2 text-[15px] text-[#71767b]">{desc}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facebook / Open Graph — 1.91:1 image on top, grey meta bar below.
// ---------------------------------------------------------------------------
export function FacebookCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const title = truncate(d.title, 88);
  const desc = truncate(d.description, 300);
  return (
    <div className="max-w-[500px] overflow-hidden rounded-md border border-[#dadde1] bg-white text-left dark:border-[#3e4042]">
      <CardImage src={d.image} className="aspect-[1.91/1] w-full" />
      <div className="bg-[#f2f3f5] px-3 py-2.5 dark:bg-[#3a3b3c]">
        <div className="text-[12px] text-[#606770] uppercase tracking-wide dark:text-[#b0b3b8]">
          {d.host}
        </div>
        <div className="mt-1 line-clamp-2 font-semibold text-[16px] text-[#1d2129] leading-tight dark:text-[#e4e6eb]">
          {title}
        </div>
        {desc && (
          <div className="mt-1 line-clamp-1 text-[14px] text-[#606770] dark:text-[#b0b3b8]">
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn — square-ish image top, white meta bar, bold title, host below.
// ---------------------------------------------------------------------------
export function LinkedInCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const title = truncate(d.title, 119);
  return (
    <div className="max-w-[520px] overflow-hidden rounded-md border border-[#e0e0e0] bg-white text-left shadow-sm dark:border-[#38434f]">
      <CardImage src={d.image} className="aspect-[1.91/1] w-full" />
      <div className="px-3 py-2.5">
        <div className="line-clamp-2 font-semibold text-[#000000e6] text-[16px] leading-snug dark:text-[#ffffffe6]">
          {title}
        </div>
        <div className="mt-1 text-[#00000099] text-[12px] dark:text-[#ffffff99]">
          {d.host}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slack unfurl — left colored bar, site name, blue title, description, image.
// ---------------------------------------------------------------------------
export function SlackCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const desc = truncate(d.description, 200);
  const siteName = page.ogSiteName || d.host;
  return (
    <div className="max-w-[520px] rounded-sm border-[#e8e8e8] border-l-4 bg-white py-1 pl-3 text-left dark:border-[#35373b] dark:bg-[#1a1d21]">
      <div className="flex items-center gap-1.5">
        {page.favicon && (
          <img src={page.favicon} alt="" className="size-4 rounded-sm" />
        )}
        <span className="font-bold text-[13px] text-[#1d1c1d] dark:text-[#d1d2d3]">
          {siteName}
        </span>
      </div>
      <div className="mt-0.5 font-bold text-[#1264a3] text-[15px] leading-snug hover:underline dark:text-[#1d9bd1]">
        {truncate(d.title, 120)}
      </div>
      {desc && (
        <div className="mt-0.5 max-w-[440px] text-[#1d1c1d] text-[15px] leading-[1.4] dark:text-[#d1d2d3]">
          {desc}
        </div>
      )}
      {d.image && (
        <CardImage
          src={d.image}
          className="mt-2 max-h-[270px] w-auto max-w-[360px] rounded-md"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// iMessage — rich link bubble: image on top, grey footer with title + domain.
// ---------------------------------------------------------------------------
export function IMessageCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const title = truncate(d.title, 50);
  return (
    <div className="w-[260px] overflow-hidden rounded-[18px] bg-[#e9e9eb] text-left dark:bg-[#26252a]">
      <CardImage src={d.image} className="aspect-[1.5/1] w-full" />
      <div className="px-3 py-2">
        <div className="line-clamp-2 font-medium text-[13px] text-black leading-tight dark:text-white">
          {title}
        </div>
        <div className="mt-0.5 text-[11px] text-[#8e8e93] uppercase">{d.host}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discord — left accent bar, site name, title (link blue), description, image.
// ---------------------------------------------------------------------------
export function DiscordCard({ page }: { page: PageResult }) {
  const d = cardData(page);
  const title = truncate(d.title, 256);
  const desc = truncate(d.description, 350);
  return (
    <div className="max-w-[440px] rounded-[4px] border-[#1e1f22] border-l-4 bg-[#2b2d31] py-2 pr-4 pl-3 text-left">
      {page.ogSiteName && (
        <div className="text-[12px] text-[#dbdee1]">{page.ogSiteName}</div>
      )}
      <div className="mt-0.5 font-semibold text-[#00a8fc] text-[16px] leading-snug hover:underline">
        {title}
      </div>
      {desc && (
        <div className="mt-1 text-[#dbdee1] text-[14px] leading-[1.375]">{desc}</div>
      )}
      {d.image && (
        <CardImage
          src={d.image}
          className="mt-3 max-h-[300px] w-auto max-w-[400px] rounded-[4px]"
        />
      )}
    </div>
  );
}
