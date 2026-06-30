// ══════════════════════════════════════════════════════════════════════════════
// ege/contentGraph.ts — In-memory content graph for intelligent editing.
//
// Models relationships between clips as a weighted graph:
//   Visual similarity   – perceptual-hash hamming distance
//   Temporal adjacency  – clips near each other on the timeline
//   Source affinity      – clips from the same source file
//   Content type match   – clips sharing the same SmartEngine classification
//   Color proximity      – clips with similar dominant color palettes
//
// Enables: match-cut suggestions, scene grouping, de-duplication detection,
// narrative bridging, and "god node" (hub clip) identification.
//
// Inspired by Graphify's knowledge-graph architecture: adjacency list for O(1)
// neighbour lookup, label-propagation community detection, BFS pathfinding.
//
// PURE & DETERMINISTIC. No React, no IPC, no filesystem, no FFmpeg imports.
// Standalone — imports nothing from other ege/ modules.
// ══════════════════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContentNode {
    clipId: string;
    sourceId: string;
    /** SmartEngine-derived tags */
    contentType?: string;
    shotType?: string;
    dominantColor?: string;
    motionEnergy?: number;
}

export type EdgeRelation =
    | 'visual-similar'
    | 'temporal-adjacent'
    | 'same-source'
    | 'same-content-type'
    | 'color-match'
    | 'match-cut-candidate';

export interface ContentEdge {
    from: string;
    to: string;
    relation: EdgeRelation;
    weight: number; // 0–1 strength
}

export interface ContentGraph {
    nodes: Map<string, ContentNode>;
    edges: ContentEdge[];
    /** Adjacency list for fast lookups */
    adjacency: Map<string, ContentEdge[]>;
}

export interface ClusterResult {
    clusterId: number;
    memberIds: string[];
    /** Auto-generated label based on dominant content type */
    label: string;
}

export interface BuildGraphOptions {
    /** Minimum weight for auto-generated same-source / same-content-type edges.
     *  Edges below this are discarded.  Default 0.1 */
    similarityThreshold?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Insert an edge into the adjacency list (both directions). */
function indexEdge(adjacency: Map<string, ContentEdge[]>, edge: ContentEdge): void {
    let fwd = adjacency.get(edge.from);
    if (!fwd) { fwd = []; adjacency.set(edge.from, fwd); }
    fwd.push(edge);

    let rev = adjacency.get(edge.to);
    if (!rev) { rev = []; adjacency.set(edge.to, rev); }
    rev.push(edge);
}

/** Push an edge into the graph, updating both `edges` and `adjacency`. */
function addEdge(graph: ContentGraph, edge: ContentEdge): void {
    graph.edges.push(edge);
    indexEdge(graph.adjacency, edge);
}

/** Check whether an edge between two nodes with a given relation already exists. */
function edgeExists(graph: ContentGraph, from: string, to: string, relation: EdgeRelation): boolean {
    const neighbours = graph.adjacency.get(from);
    if (!neighbours) return false;
    return neighbours.some(e =>
        e.relation === relation &&
        ((e.from === from && e.to === to) || (e.from === to && e.to === from)),
    );
}

/** Clamp a number to [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// ── Perceptual-hash utilities ────────────────────────────────────────────────

/** Convert a hex character to its 4-bit integer. */
function hexVal(ch: string): number {
    const c = ch.charCodeAt(0);
    // '0'-'9' → 0-9
    if (c >= 48 && c <= 57) return c - 48;
    // 'a'-'f' → 10-15
    if (c >= 97 && c <= 102) return c - 87;
    // 'A'-'F' → 10-15
    if (c >= 65 && c <= 70) return c - 55;
    return 0;
}

/** Count the number of 1-bits in a 4-bit value (0-15). */
function popcount4(n: number): number {
    // Brian Kernighan's approach — at most 4 iterations.
    let count = 0;
    let v = n;
    while (v) { v &= v - 1; count++; }
    return count;
}

/**
 * Hamming distance between two hex-encoded perceptual hashes.
 * Returns the fraction of differing bits, normalised to 0–1.
 * If the hashes differ in length, the shorter one is right-padded with 0.
 */
function hammingDistance(a: string, b: string): number {
    const len = Math.max(a.length, b.length);
    if (len === 0) return 0;
    let diffBits = 0;
    for (let i = 0; i < len; i++) {
        const va = i < a.length ? hexVal(a[i]) : 0;
        const vb = i < b.length ? hexVal(b[i]) : 0;
        diffBits += popcount4(va ^ vb);
    }
    // Total possible bits = len * 4 (each hex char encodes 4 bits).
    return diffBits / (len * 4);
}

// ── Color distance ───────────────────────────────────────────────────────────

/** Euclidean distance between two RGB triples, normalised to 0–1. */
function colorDistance(a: [number, number, number], b: [number, number, number]): number {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    // Max possible distance: sqrt(255² + 255² + 255²) ≈ 441.67
    return Math.sqrt(dr * dr + dg * dg + db * db) / 441.6729559300637;
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Build the content graph from analysed clips.
 *
 * Automatically inserts:
 * - `same-source` edges between clips sharing a `sourceId`
 * - `same-content-type` edges between clips sharing a `contentType`
 */
export function buildContentGraph(
    nodes: ContentNode[],
    options?: BuildGraphOptions,
): ContentGraph {
    const threshold = options?.similarityThreshold ?? 0.1;

    const graph: ContentGraph = {
        nodes: new Map(),
        edges: [],
        adjacency: new Map(),
    };

    // Index nodes
    for (const node of nodes) {
        graph.nodes.set(node.clipId, node);
        // Ensure every node appears in the adjacency map (even with no edges).
        if (!graph.adjacency.has(node.clipId)) {
            graph.adjacency.set(node.clipId, []);
        }
    }

    // ── Same-source edges ────────────────────────────────────────────────
    const bySource = new Map<string, string[]>();
    for (const n of nodes) {
        let arr = bySource.get(n.sourceId);
        if (!arr) { arr = []; bySource.set(n.sourceId, arr); }
        arr.push(n.clipId);
    }
    for (const members of Array.from(bySource.values())) {
        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                const weight = 0.6; // Fixed weight for same-source affinity
                if (weight >= threshold) {
                    addEdge(graph, {
                        from: members[i],
                        to: members[j],
                        relation: 'same-source',
                        weight,
                    });
                }
            }
        }
    }

    // ── Same-content-type edges ──────────────────────────────────────────
    const byType = new Map<string, string[]>();
    for (const n of nodes) {
        if (!n.contentType) continue;
        let arr = byType.get(n.contentType);
        if (!arr) { arr = []; byType.set(n.contentType, arr); }
        arr.push(n.clipId);
    }
    for (const members of Array.from(byType.values())) {
        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                const weight = 0.5; // Fixed weight for same-content-type
                if (weight >= threshold) {
                    addEdge(graph, {
                        from: members[i],
                        to: members[j],
                        relation: 'same-content-type',
                        weight,
                    });
                }
            }
        }
    }

    return graph;
}

// ── Visual similarity ────────────────────────────────────────────────────────

/**
 * Add edges between visually similar clips using perceptual hash distance.
 *
 * @param hashMap  clipId → hex-encoded perceptual hash
 */
export function addVisualSimilarityEdges(
    graph: ContentGraph,
    hashMap: Map<string, string>,
): void {
    const ids = Array.from(hashMap.keys()).filter(id => graph.nodes.has(id));

    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i];
            const b = ids[j];
            const dist = hammingDistance(hashMap.get(a)!, hashMap.get(b)!);
            // Similarity = 1 − distance.  Skip if too dissimilar (< 0.5).
            const similarity = 1 - dist;
            if (similarity >= 0.5) {
                addEdge(graph, {
                    from: a,
                    to: b,
                    relation: 'visual-similar',
                    weight: clamp(similarity, 0, 1),
                });
            }
        }
    }
}

// ── Color proximity ──────────────────────────────────────────────────────────

/**
 * Add edges between clips with similar colour palettes.
 *
 * @param colorMap  clipId → dominant RGB triple [r, g, b] (0-255 each)
 */
export function addColorProximityEdges(
    graph: ContentGraph,
    colorMap: Map<string, [number, number, number]>,
): void {
    const ids = Array.from(colorMap.keys()).filter(id => graph.nodes.has(id));

    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i];
            const b = ids[j];
            const dist = colorDistance(colorMap.get(a)!, colorMap.get(b)!);
            // Similarity = 1 − distance.  Skip if too dissimilar (< 0.6).
            const similarity = 1 - dist;
            if (similarity >= 0.6) {
                addEdge(graph, {
                    from: a,
                    to: b,
                    relation: 'color-match',
                    weight: clamp(similarity, 0, 1),
                });
            }
        }
    }
}

// ── Match-cut partner ────────────────────────────────────────────────────────

/**
 * Find the best match-cut partner for a given clip.
 *
 * Scoring weights:
 *   visual similarity   0.4
 *   color proximity      0.3
 *   motion energy sim.   0.3
 *
 * Only considers clips that share at least one edge with `clipId`.
 * Returns null if the clip has no neighbours.
 */
export function findMatchCutPartner(
    graph: ContentGraph,
    clipId: string,
): { partnerId: string; score: number } | null {
    const node = graph.nodes.get(clipId);
    if (!node) return null;

    const neighbours = graph.adjacency.get(clipId);
    if (!neighbours || neighbours.length === 0) return null;

    // Collect per-candidate raw scores by relation type.
    const candidates = new Map<string, { visual: number; color: number; motion: number }>();

    for (const edge of neighbours) {
        const otherId = edge.from === clipId ? edge.to : edge.from;
        if (otherId === clipId) continue; // Self-loop guard

        let bucket = candidates.get(otherId);
        if (!bucket) { bucket = { visual: 0, color: 0, motion: 0 }; candidates.set(otherId, bucket); }

        if (edge.relation === 'visual-similar') {
            bucket.visual = Math.max(bucket.visual, edge.weight);
        } else if (edge.relation === 'color-match') {
            bucket.color = Math.max(bucket.color, edge.weight);
        }
    }

    // Motion energy similarity: compare motionEnergy values directly.
    for (const [otherId, bucket] of Array.from(candidates.entries())) {
        const otherNode = graph.nodes.get(otherId);
        if (node.motionEnergy != null && otherNode?.motionEnergy != null) {
            const diff = Math.abs(node.motionEnergy - otherNode.motionEnergy);
            bucket.motion = clamp(1 - diff, 0, 1);
        }
    }

    let bestId: string | null = null;
    let bestScore = -1;

    for (const [otherId, bucket] of Array.from(candidates.entries())) {
        const score = bucket.visual * 0.4 + bucket.color * 0.3 + bucket.motion * 0.3;
        if (score > bestScore) {
            bestScore = score;
            bestId = otherId;
        }
    }

    if (bestId === null) return null;
    return { partnerId: bestId, score: clamp(bestScore, 0, 1) };
}

// ── Cluster detection (label propagation) ────────────────────────────────────

/**
 * Simple community detection: group tightly-connected clips into clusters.
 *
 * Uses the label propagation algorithm:
 * 1. Assign each node its own unique label.
 * 2. Iterate (up to 20 rounds): each node adopts the label that appears most
 *    frequently among its neighbours (ties broken by lowest label).
 * 3. Nodes sharing a label become one cluster.
 */
export function detectClusters(graph: ContentGraph): ClusterResult[] {
    const MAX_ITERATIONS = 20;
    const nodeIds = Array.from(graph.nodes.keys());
    if (nodeIds.length === 0) return [];

    // Initialise labels — each node gets its own index.
    const label = new Map<string, number>();
    for (let i = 0; i < nodeIds.length; i++) {
        label.set(nodeIds[i], i);
    }

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let changed = false;

        for (const nodeId of nodeIds) {
            const neighbours = graph.adjacency.get(nodeId);
            if (!neighbours || neighbours.length === 0) continue;

            // Count neighbour labels, weighted by edge weight.
            const counts = new Map<number, number>();
            for (const edge of neighbours) {
                const otherId = edge.from === nodeId ? edge.to : edge.from;
                if (otherId === nodeId) continue;
                const otherLabel = label.get(otherId)!;
                counts.set(otherLabel, (counts.get(otherLabel) ?? 0) + edge.weight);
            }

            if (counts.size === 0) continue;

            // Pick the label with the highest weighted count (ties → lowest label).
            let bestLabel = label.get(nodeId)!;
            let bestCount = -1;
            for (const [lbl, cnt] of Array.from(counts.entries())) {
                if (cnt > bestCount || (cnt === bestCount && lbl < bestLabel)) {
                    bestLabel = lbl;
                    bestCount = cnt;
                }
            }

            if (bestLabel !== label.get(nodeId)) {
                label.set(nodeId, bestLabel);
                changed = true;
            }
        }

        if (!changed) break; // Stable — stop early.
    }

    // Group by final label.
    const clusters = new Map<number, string[]>();
    for (const [nodeId, lbl] of Array.from(label.entries())) {
        let arr = clusters.get(lbl);
        if (!arr) { arr = []; clusters.set(lbl, arr); }
        arr.push(nodeId);
    }

    // Build results with auto-generated labels.
    const results: ClusterResult[] = [];
    let clusterId = 0;
    for (const [, memberIds] of Array.from(clusters.entries())) {
        results.push({
            clusterId: clusterId++,
            memberIds,
            label: generateClusterLabel(graph, memberIds),
        });
    }

    // Sort by size descending for consistency.
    results.sort((a, b) => b.memberIds.length - a.memberIds.length);
    // Re-number after sort.
    for (let i = 0; i < results.length; i++) results[i].clusterId = i;

    return results;
}

/**
 * Auto-generate a human-readable label for a cluster based on the dominant
 * content type among its members.
 */
function generateClusterLabel(graph: ContentGraph, memberIds: string[]): string {
    const typeCounts = new Map<string, number>();
    for (const id of memberIds) {
        const node = graph.nodes.get(id);
        const ct = node?.contentType ?? 'untyped';
        typeCounts.set(ct, (typeCounts.get(ct) ?? 0) + 1);
    }

    let dominantType = 'mixed';
    let maxCount = 0;
    for (const [type, count] of Array.from(typeCounts.entries())) {
        if (count > maxCount) {
            dominantType = type;
            maxCount = count;
        }
    }

    const n = memberIds.length;
    return `${dominantType} (${n} clip${n === 1 ? '' : 's'})`;
}

// ── Path finding (BFS) ──────────────────────────────────────────────────────

/**
 * Find the shortest path between two clips through the graph (unweighted BFS).
 *
 * Returns the ordered list of clip IDs from `fromId` to `toId` (inclusive).
 * Returns an empty array if no path exists or either node is missing.
 */
export function findPath(
    graph: ContentGraph,
    fromId: string,
    toId: string,
): string[] {
    if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return [];
    if (fromId === toId) return [fromId];

    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: string[] = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
        const current = queue.shift()!;

        const neighbours = graph.adjacency.get(current);
        if (!neighbours) continue;

        for (const edge of neighbours) {
            const otherId = edge.from === current ? edge.to : edge.from;
            if (visited.has(otherId)) continue;

            visited.add(otherId);
            parent.set(otherId, current);

            if (otherId === toId) {
                // Reconstruct path.
                const path: string[] = [];
                let cur: string | undefined = toId;
                while (cur !== undefined) {
                    path.push(cur);
                    cur = parent.get(cur);
                }
                path.reverse();
                return path;
            }

            queue.push(otherId);
        }
    }

    return []; // No path found.
}

// ── Hub clip detection ───────────────────────────────────────────────────────

/**
 * Get the N most connected clips ("god nodes" — structurally important).
 *
 * Ranks by degree (number of edges incident on each node), descending.
 */
export function findHubClips(
    graph: ContentGraph,
    n: number,
): Array<{ clipId: string; connectionCount: number }> {
    const degree = new Map<string, number>();
    for (const nodeId of Array.from(graph.nodes.keys())) {
        degree.set(nodeId, 0);
    }

    for (const edge of graph.edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }

    const ranked = Array.from(degree.entries())
        .map(([clipId, connectionCount]) => ({ clipId, connectionCount }))
        .sort((a, b) => b.connectionCount - a.connectionCount);

    return ranked.slice(0, Math.max(0, n));
}
