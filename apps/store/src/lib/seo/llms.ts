export type LlmsLink = {
  title: string;
  url: string;
  /** Short note after the link, kept to one line. */
  note?: string;
};

export type LlmsSection = {
  heading: string;
  links: readonly LlmsLink[];
};

const ONE_LINE = /\s+/g;

const singleLine = (text: string): string => text.replace(ONE_LINE, " ").trim();

const renderLink = ({ title, url, note }: LlmsLink): string =>
  `- [${singleLine(title)}](${url})${note ? `: ${singleLine(note)}` : ""}`;

/**
 * Plain-markdown site guide in the llms.txt layout: a title, a one-line
 * summary, free text, then sections of links. Agents that fetch the site root
 * read it to find the catalogue, the feed and the policies without crawling.
 */
export const renderLlmsTxt = ({
  name,
  summary,
  details,
  sections,
}: {
  name: string;
  summary: string;
  details: readonly string[];
  sections: readonly LlmsSection[];
}): string => {
  const blocks = [
    `# ${singleLine(name)}`,
    `> ${singleLine(summary)}`,
    ...details.map(singleLine),
    ...sections
      .filter((section) => section.links.length > 0)
      .map(
        (section) =>
          `## ${singleLine(section.heading)}\n\n${section.links.map(renderLink).join("\n")}`
      ),
  ];
  return `${blocks.join("\n\n")}\n`;
};
