import * as cheerio from "cheerio";
import axios from "axios";

const USER_AGENT =
    "Mozilla/5.0 (compatible; CRMBot/1.0; +https://crm.skynns.com.br/bot)";

/**
 * Fetches a single URL, extracts the main textual content (strips nav, footer,
 * scripts, ads) and returns clean text.
 *
 * Respects robots.txt at the domain level (checked on first crawl of domain).
 */
export async function scrapeUrl(url: string): Promise<string> {
    await checkRobotsTxt(url);

    const response = await axios.get<string>(url, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15_000,
        maxContentLength: 5 * 1024 * 1024, // 5 MB cap
        responseType: "text",
    });

    return extractText(response.data, url);
}

/**
 * Crawls multiple pages within the same domain up to `maxPages` depth.
 * Returns concatenated text from all pages.
 */
export async function crawlWebsite(
    startUrl: string,
    maxPages = 10,
): Promise<string> {
    await checkRobotsTxt(startUrl);

    const origin = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queue = [startUrl];
    const texts: string[] = [];

    while (queue.length > 0 && texts.length < maxPages) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        try {
            const response = await axios.get<string>(url, {
                headers: { "User-Agent": USER_AGENT },
                timeout: 15_000,
                maxContentLength: 5 * 1024 * 1024,
                responseType: "text",
            });

            const html: string = response.data;
            texts.push(extractText(html, url));

            // Discover links on the same domain
            const $ = cheerio.load(html);
            $("a[href]").each((_, el) => {
                const href = $(el).attr("href") ?? "";
                try {
                    const absolute = new URL(href, url).href;
                    if (absolute.startsWith(origin) && !visited.has(absolute)) {
                        queue.push(absolute);
                    }
                } catch {
                    // Ignore malformed URLs
                }
            });
        } catch {
            // Skip pages that fail to load
        }
    }

    return texts.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(html: string, _url: string): string {
    const $ = cheerio.load(html);

    // Remove non-content elements
    $(
        "script, style, noscript, nav, footer, header, aside, iframe, " +
        "[role=navigation], [role=banner], [role=complementary], " +
        ".ads, .advertisement, .sidebar, .cookie-banner",
    ).remove();

    // Prefer main content containers
    const mainSelector = "main, article, [role=main], .content, #content, .post, #main";
    const main = $(mainSelector).first();
    const root = main.length > 0 ? main : $("body");

    return root
        .text()
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const robotsCache = new Map<string, Set<string>>();

async function checkRobotsTxt(url: string): Promise<void> {
    const { origin } = new URL(url);
    if (robotsCache.has(origin)) return;

    try {
        const response = await axios.get<string>(`${origin}/robots.txt`, {
            headers: { "User-Agent": USER_AGENT },
            timeout: 5_000,
            responseType: "text",
        });

        const disallowed = new Set<string>();
        let isOurAgent = false;
        for (const line of response.data.split("\n")) {
            const trimmed = line.trim().toLowerCase();
            if (trimmed.startsWith("user-agent:")) {
                const agent = trimmed.replace("user-agent:", "").trim();
                isOurAgent = agent === "*" || agent === "crmbot";
            } else if (isOurAgent && trimmed.startsWith("disallow:")) {
                const path = trimmed.replace("disallow:", "").trim();
                if (path) disallowed.add(path);
            }
        }
        robotsCache.set(origin, disallowed);
    } catch {
        robotsCache.set(origin, new Set()); // assume allowed if no robots.txt
    }

    const { pathname } = new URL(url);
    const rules = robotsCache.get(origin)!;
    for (const rule of rules) {
        if (pathname.startsWith(rule)) {
            throw new Error(`URL ${url} disallowed by robots.txt`);
        }
    }
}
