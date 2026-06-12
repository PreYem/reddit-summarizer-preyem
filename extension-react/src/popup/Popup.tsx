import SocialLinks from "./components/SocialLinks";

export default function Popup() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-[18px] pb-[14px]">

      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15px] font-bold text-reddit-orange">
          Reddit Summarizer REACT VERSION
        </h1>
        <span className="text-[10px] text-white/20">v1.0.0</span>
      </div>

      {/* Description */}
      <p className="text-[12.5px] leading-relaxed text-text-muted">
        Open any Reddit text post and click{" "}
        <strong className="text-text-primary font-semibold">AI Summary</strong>{" "}
        to get a concise breakdown of the post along with the most relevant
        insights from the top comments.
      </p>

      {/* Status */}
      <div className="flex items-center gap-[7px] text-[11.5px] text-reddit-green">
        <span className="w-[7px] h-[7px] rounded-full bg-reddit-green shrink-0" />
        Active on Reddit
      </div>

      {/* Divider */}
      <hr className="border-none h-px bg-divider" />

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-faint">
          Extension made by PreYem
        </span>
        <SocialLinks />
      </div>

    </div>
  );
}
