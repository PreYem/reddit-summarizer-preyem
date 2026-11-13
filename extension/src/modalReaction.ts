import { SummarizeResponse } from "@shared/types";
import { reactionLabel, uiText } from "@shared/languages";

/**
 * Converts reaction type to CSS class name
 */
function getReactionClass(reaction: string): string {
  const classMap: Record<string, string> = {
    "Overwhelmingly Positive": "reaction-overwhelmingly-positive",
    "Positive": "reaction-positive",
    "Mixed": "reaction-mixed",
    "Negative": "reaction-negative",
    "Overwhelmingly Negative": "reaction-overwhelmingly-negative",
    "Inconclusive": "reaction-inconclusive",
  };
  return classMap[reaction] || "reaction-inconclusive";
}

/**
 * Creates the community reaction section DOM element
 * Displays reaction badge + breakdown text
 */
export function createReactionSection(summary: SummarizeResponse, uiLanguage = "en", commentCount = 0): HTMLDivElement {
  // Container
  const communityReactionSection = document.createElement("div");
  communityReactionSection.className = "rs-section";

  // Label + Reaction Badge Container
  const reactionLabelContainer = document.createElement("div");
  reactionLabelContainer.className = "rs-reaction-label-container";

  // "Community Reaction" label
  const communityReactionLabel = document.createElement("div");
  communityReactionLabel.className = "rs-section-label";
  communityReactionLabel.textContent = uiText(uiLanguage, "sec_reaction");

  // Reaction value (colored badge)
  const reactionBadge = document.createElement("span");
  reactionBadge.textContent = reactionLabel(uiLanguage, summary.communityReaction);
  reactionBadge.className = `rs-reaction-badge ${getReactionClass(summary.communityReaction)}`;

  reactionLabelContainer.appendChild(communityReactionLabel);
  reactionLabelContainer.appendChild(reactionBadge);

  // Breakdown text + #27: localized "Based on N comments." line rendered from the
  // actual scraped count instead of trusting the model to append it - PreYem
  const communityReactionText = document.createElement("p");
  communityReactionText.className = "rs-section-text";
  const basedOnComments = commentCount > 0 ? uiText(uiLanguage, "based_on_comments").replace("{n}", String(commentCount)) : "";
  communityReactionText.textContent = basedOnComments ? summary.communityReactionBreakdown + " " + basedOnComments : summary.communityReactionBreakdown;
  communityReactionText.style.marginTop = "8px";

  communityReactionSection.appendChild(reactionLabelContainer);
  communityReactionSection.appendChild(communityReactionText);

  return communityReactionSection;
}