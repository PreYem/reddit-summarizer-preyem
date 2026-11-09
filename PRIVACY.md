# Privacy Policy — Reddit Summarizer

**Last updated:** November 9, 2026

Reddit Summarizer is a browser extension that uses AI to summarize Reddit posts and their top comments. This page explains what data the extension interacts with and how it's used.

## What we do NOT collect

Reddit Summarizer does not collect, store, or track any personal or user-identifying data. Specifically, it does not know or record:

- Who you are, or any account/profile information
- Which Reddit account you're logged into
- Your browsing history or which pages you visit
- Any activity outside of an explicit button click on a Reddit post

The extension only activates when you manually click the "AI Summary" button on a Reddit post — it does not run automatically or collect anything in the background.

## What data is sent, and why

When you click "AI Summary," the extension sends the following content to our backend **solely to generate the summary you requested**:

- The subreddit name
- The Reddit post's title and text content
- The top comments on the post
- The original poster's (OP) public Reddit handle (username)
- The post's canonical Reddit URL (permalink)

This data is used only to generate the AI summary that's displayed back to you. It is **not stored, logged, retained, or linked to any user or account** on our servers. Once the summary is generated and returned to your browser, the request data is discarded.

## Third parties

The scraped post/comment content is sent to our backend server, which forwards it to an AI inference provider to generate the summary text. The backend tries providers in this order, using the first one that succeeds:

- **Groq** — `openai/gpt-oss-20b`
- **Google Gemini** — `gemini-2.5-flash`
- **Anthropic Claude** — `claude-haiku-4-5`

Keep in mind that these models are subject to change

Only the content needed for the summary you requested is sent to the provider handling that request. No other third parties receive this data.

## Data retention

The content described above is not retained beyond the time needed to process a single summary request, and it is never linked to any user, account, or browsing session.

The backend does keep a rolling **usage log** of the latest 500 summary requests (older entries rotate out), used only to power the server's own usage-stats dashboard. Each entry stores: request timestamp, requester IP, user agent, HTTP status, which AI provider served the request, and post metadata — subreddit name, post title, a short body preview (first 50 characters), the post's word count, the OP handle, and the post URL. No comment text, no full post body, and no cookies or identifiers beyond the request's own IP are kept.

## Changes to this policy

If this policy changes, the updated version will be posted at this same URL with a revised "Last updated" date.

## Contact

For questions about this policy or the extension, open an issue on the GitHub repository:
https://github.com/PreYem/reddit-summarizer-preyem
