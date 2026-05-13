import axios from "axios";
import type { SearchResult } from "../knowledge.schema.js";

const VERTEX_SEARCH_ENDPOINT = process.env.VERTEX_SEARCH_ENDPOINT ?? "";
const VERTEX_INDEX_ENDPOINT = process.env.VERTEX_INDEX_ENDPOINT ?? "";

interface VertexNeighbor {
    datapoint: { datapointId: string };
    distance: number;
}

interface VertexQueryResponse {
    nearestNeighbors: Array<{ neighbors: VertexNeighbor[] }>;
}

/**
 * Searches using Vertex AI Vector Search (Matching Engine).
 * Used by ENTERPRISE tier organizations.
 *
 * Requires:
 *   VERTEX_SEARCH_ENDPOINT  — e.g. https://{region}-aiplatform.googleapis.com/...
 *   VERTEX_INDEX_ENDPOINT   — deployed index endpoint resource name
 */
export async function vertexSearch(
    queryVector: number[],
    _orgId: string,
    documentIds: string[],
    limit: number,
    chunkMetadataResolver: (ids: string[]) => Promise<SearchResult[]>,
): Promise<SearchResult[]> {
    if (!VERTEX_SEARCH_ENDPOINT || !VERTEX_INDEX_ENDPOINT) {
        throw new Error(
            "VERTEX_SEARCH_ENDPOINT e VERTEX_INDEX_ENDPOINT devem ser configurados " +
            "para usar Vertex AI Vector Search (tier ENTERPRISE).",
        );
    }

    const token = await getAccessToken();

    const response = await axios.post<VertexQueryResponse>(
        `${VERTEX_SEARCH_ENDPOINT}/findNeighbors`,
        {
            deployedIndexId: VERTEX_INDEX_ENDPOINT,
            queries: [
                {
                    datapoint: { featureVector: queryVector },
                    neighborCount: limit * 3, // over-fetch to allow filtering
                },
            ],
        },
        { headers: { Authorization: `Bearer ${token}` } },
    );

    const neighbors = response.data.nearestNeighbors[0]?.neighbors ?? [];
    // Filter to chunks that belong to the queried knowledge bases
    const chunkIds = neighbors
        .map((n) => n.datapoint.datapointId)
        .filter((id) => documentIds.includes(id))
        .slice(0, limit);

    if (chunkIds.length === 0) return [];
    return chunkMetadataResolver(chunkIds);
}

async function getAccessToken(): Promise<string> {
    // GOOGLE_VERTEX_ACCESS_TOKEN is only for local/CI overrides.
    // In production the GCP metadata server is always used.
    if (process.env.GOOGLE_VERTEX_ACCESS_TOKEN) {
        return process.env.GOOGLE_VERTEX_ACCESS_TOKEN;
    }
    const resp = await axios.get<{ access_token: string }>(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" }, timeout: 3_000 },
    );
    return resp.data.access_token;
}
