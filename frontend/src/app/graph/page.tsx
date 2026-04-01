"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as d3 from "d3";
import { apiFetch } from "@/lib/api";
import { ENTITY_CONFIGS } from "@/lib/entities";

/* Suspense wrapper required by Next.js for useSearchParams */
export default function GraphPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen bg-gray-900 flex items-center justify-center text-gray-400">
          Loading graph...
        </div>
      }
    >
      <GraphPageInner />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  entityType: string;
  slug: string;
  verificationTier: string;
  connections: number;
  radius: number;
  visible: boolean;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  relationshipType: string;
  verificationTier: string;
  sourceId: string;
  targetId: string;
}

interface Tooltip {
  x: number;
  y: number;
  node: GraphNode;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYPE_COLORS: Record<string, string> = {
  companies:  "#3B82F6", // blue
  people:     "#F97316", // orange
  wallets:    "#22C55E", // green
  banks:      "#A855F7", // purple
  violations: "#EF4444", // red
};

const TYPE_LABELS: Record<string, string> = {
  companies: "Companies",
  people: "People",
  wallets: "Wallets",
  banks: "Banks",
  violations: "Violations",
};

const TIER_BORDER: Record<string, string> = {
  verified:   "#16A34A",
  probable:   "#CA8A04",
  unverified: "#DC2626",
};

const HIGHLIGHT_COLOR = "#FBBF24";
const EDGE_COLOR = "#D1D5DB";
const EDGE_ACTIVE_COLOR = "#6B7280";
const LABEL_FONT = "11px system-ui, sans-serif";
const EDGE_FONT = "9px system-ui, sans-serif";
const MAX_NODES = 500;

const SLUGS = Object.keys(ENTITY_CONFIGS);

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

async function loadGraphData(): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Load entities from all five endpoints (capped at MAX_NODES total)
  let remaining = MAX_NODES;
  for (const slug of SLUGS) {
    if (remaining <= 0) break;
    const perPage = Math.min(remaining, 100);
    try {
      const data = await apiFetch<{ items: any[]; total: number }>(
        `${ENTITY_CONFIGS[slug].apiPath}?per_page=${perPage}`
      );
      for (const item of data.items) {
        const name =
          item.name || item.label || item.address || item.violation_type || "(unnamed)";
        nodeMap.set(item.id, {
          id: item.id,
          name,
          entityType: slug,
          slug,
          verificationTier: item.verification_tier || "unverified",
          connections: 0,
          radius: 6,
          visible: true,
        });
        remaining--;
        if (remaining <= 0) break;
      }
    } catch {
      // skip failed endpoints
    }
  }

  // Load relationships
  // We query the relational table through a lightweight endpoint
  try {
    // Fetch relationships for every loaded node (batch via the entity endpoint)
    const nodeIds = Array.from(nodeMap.keys());
    const seenEdges = new Set<string>();

    // Fetch in batches of 20 to avoid overwhelming the API
    for (let i = 0; i < Math.min(nodeIds.length, 100); i++) {
      try {
        const relData = await apiFetch<{
          entity_id: string;
          total: number;
          by_type: Record<string, any[]>;
        }>(`/api/v1/entities/${nodeIds[i]}/relationships`);

        for (const [relType, items] of Object.entries(relData.by_type)) {
          for (const rel of items) {
            if (seenEdges.has(rel.id)) continue;
            seenEdges.add(rel.id);

            // Only include edges where both nodes are loaded
            if (nodeMap.has(rel.source_id) && nodeMap.has(rel.target_id)) {
              edges.push({
                id: rel.id,
                source: rel.source_id,
                target: rel.target_id,
                sourceId: rel.source_id,
                targetId: rel.target_id,
                relationshipType: relType,
                verificationTier: rel.verification_tier || "unverified",
              });

              // Increment connection counts
              const src = nodeMap.get(rel.source_id);
              const tgt = nodeMap.get(rel.target_id);
              if (src) src.connections++;
              if (tgt) tgt.connections++;
            }
          }
        }
      } catch {
        // skip failed relationship fetches
      }
    }
  } catch {
    // relationships failed entirely
  }

  // Set node radius based on connection count
  const allNodes = Array.from(nodeMap.values());
  for (const node of allNodes) {
    node.radius = Math.max(6, Math.min(20, 6 + node.connections * 2));
  }

  return { nodes: allNodes, edges };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function GraphPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightEntityId = searchParams.get("entity");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const transformRef = useRef(d3.zoomIdentity);
  const tooltipRef = useRef<Tooltip | null>(null);
  const selectedRef = useRef<GraphNode | null>(null);
  const dragNodeRef = useRef<GraphNode | null>(null);

  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [search, setSearch] = useState("");
  const [typeVisibility, setTypeVisibility] = useState<Record<string, boolean>>(
    Object.fromEntries(SLUGS.map((s) => [s, true]))
  );
  const [tierFilter, setTierFilter] = useState<string>("");

  /* ---- Canvas draw function ---- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const t = transformRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const selected = selectedRef.current;

    // Draw edges
    for (const edge of edges) {
      const src = edge.source as GraphNode;
      const tgt = edge.target as GraphNode;
      if (!src.visible || !tgt.visible) continue;
      if (src.x == null || tgt.x == null) continue;

      const isActive =
        selected && (src.id === selected.id || tgt.id === selected.id);

      ctx.beginPath();
      ctx.moveTo(src.x, src.y!);
      ctx.lineTo(tgt.x, tgt.y!);
      ctx.strokeStyle = isActive ? EDGE_ACTIVE_COLOR : EDGE_COLOR;
      ctx.lineWidth = isActive ? 1.5 : 0.5;
      ctx.stroke();

      // Edge label (only when zoomed in enough)
      if (t.k > 0.8) {
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y! + tgt.y!) / 2;
        ctx.font = EDGE_FONT;
        ctx.fillStyle = "#9CA3AF";
        ctx.textAlign = "center";
        ctx.fillText(edge.relationshipType.replace(/_/g, " "), mx, my - 3);
      }
    }

    // Draw nodes
    for (const node of nodes) {
      if (!node.visible || node.x == null) continue;

      const isHighlighted =
        highlightEntityId === node.id ||
        (search &&
          node.name.toLowerCase().includes(search.toLowerCase()));
      const isSelected = selected?.id === node.id;

      // Outer ring for highlighted / selected
      if (isHighlighted || isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y!, node.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = HIGHLIGHT_COLOR;
        ctx.fill();
      }

      // Verification tier ring
      ctx.beginPath();
      ctx.arc(node.x, node.y!, node.radius + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = TIER_BORDER[node.verificationTier] || TIER_BORDER.unverified;
      ctx.fill();

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y!, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLORS[node.entityType] || "#6B7280";
      ctx.fill();

      // Node label (only when zoomed in or node is highlighted)
      if (t.k > 0.6 || isHighlighted || isSelected) {
        ctx.font = LABEL_FONT;
        ctx.fillStyle = "#1F2937";
        ctx.textAlign = "center";
        const label =
          node.name.length > 24
            ? node.name.slice(0, 22) + "…"
            : node.name;
        ctx.fillText(label, node.x, node.y! + node.radius + 14);
      }
    }

    ctx.restore();
  }, [highlightEntityId, search]);

  /* ---- Find node under cursor ---- */
  const nodeAtPoint = useCallback(
    (px: number, py: number): GraphNode | null => {
      const t = transformRef.current;
      const x = (px - t.x) / t.k;
      const y = (py - t.y) / t.k;

      // Search in reverse (top-most drawn last)
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!n.visible || n.x == null) continue;
        const dx = x - n.x;
        const dy = y - n.y!;
        if (dx * dx + dy * dy <= (n.radius + 4) ** 2) return n;
      }
      return null;
    },
    []
  );

  /* ---- Initialize simulation and bindinteractions ---- */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      const { nodes, edges } = await loadGraphData();
      if (cancelled) return;

      nodesRef.current = nodes;
      edgesRef.current = edges;
      setNodeCount(nodes.length);
      setEdgeCount(edges.length);

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Size canvas to container
      const resize = () => {
        const parent = canvas.parentElement;
        if (!parent) return;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        draw();
      };
      resize();
      window.addEventListener("resize", resize);

      // Create force simulation
      const sim = d3
        .forceSimulation<GraphNode>(nodes)
        .force(
          "link",
          d3
            .forceLink<GraphNode, GraphEdge>(edges)
            .id((d) => d.id)
            .distance(80)
        )
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center", d3.forceCenter(canvas.width / 2, canvas.height / 2))
        .force("collision", d3.forceCollide<GraphNode>().radius((d) => d.radius + 4))
        .on("tick", draw);

      simRef.current = sim;

      // Zoom / pan
      const zoomBehavior = d3
        .zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => {
          transformRef.current = event.transform;
          draw();
        });

      const canvasSel = d3.select(canvas);
      canvasSel.call(zoomBehavior);

      // If a highlight entity was passed, center on it after simulation stabilizes
      if (highlightEntityId) {
        setTimeout(() => {
          const target = nodes.find((n) => n.id === highlightEntityId);
          if (target && target.x != null) {
            const t = d3.zoomIdentity
              .translate(canvas.width / 2, canvas.height / 2)
              .scale(1.5)
              .translate(-target.x, -target.y!);
            canvasSel
              .transition()
              .duration(800)
              .call(zoomBehavior.transform, t);
          }
        }, 1500);
      }

      // Click / double-click / drag
      let clickTimer: ReturnType<typeof setTimeout> | null = null;
      let isDragging = false;

      canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const node = nodeAtPoint(e.clientX - rect.left, e.clientY - rect.top);
        if (node) {
          isDragging = true;
          dragNodeRef.current = node;
          node.fx = node.x;
          node.fy = node.y;
          sim.alphaTarget(0.3).restart();
        }
      });

      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        if (isDragging && dragNodeRef.current) {
          const t = transformRef.current;
          dragNodeRef.current.fx = (px - t.x) / t.k;
          dragNodeRef.current.fy = (py - t.y) / t.k;
          return;
        }

        // Hover tooltip
        const node = nodeAtPoint(px, py);
        if (node) {
          canvas.style.cursor = "pointer";
          tooltipRef.current = { x: e.clientX, y: e.clientY, node };
          setTooltip({ x: e.clientX, y: e.clientY, node });
        } else {
          canvas.style.cursor = "grab";
          if (tooltipRef.current) {
            tooltipRef.current = null;
            setTooltip(null);
          }
        }
      });

      canvas.addEventListener("mouseup", () => {
        if (dragNodeRef.current) {
          dragNodeRef.current.fx = null;
          dragNodeRef.current.fy = null;
          sim.alphaTarget(0);
          dragNodeRef.current = null;
        }
        isDragging = false;
      });

      canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const node = nodeAtPoint(e.clientX - rect.left, e.clientY - rect.top);

        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          // Double click -> navigate
          if (node) {
            router.push(`/entities/${node.slug}/${node.id}`);
          }
          return;
        }

        clickTimer = setTimeout(() => {
          clickTimer = null;
          // Single click -> select
          selectedRef.current = node;
          draw();
        }, 250);
      });

      setLoading(false);

      return () => {
        window.removeEventListener("resize", resize);
        sim.stop();
      };
    }

    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Apply filters ---- */
  useEffect(() => {
    const nodes = nodesRef.current;
    for (const node of nodes) {
      const typeVisible = typeVisibility[node.entityType] !== false;
      const tierVisible = !tierFilter || node.verificationTier === tierFilter;
      node.visible = typeVisible && tierVisible;
    }
    draw();
  }, [typeVisibility, tierFilter, draw]);

  /* ---- Search highlight ---- */
  useEffect(() => {
    if (!search) {
      draw();
      return;
    }

    // Center on first match
    const match = nodesRef.current.find(
      (n) =>
        n.visible && n.name.toLowerCase().includes(search.toLowerCase())
    );
    if (match && match.x != null && canvasRef.current) {
      const canvas = canvasRef.current;
      const t = d3.zoomIdentity
        .translate(canvas.width / 2, canvas.height / 2)
        .scale(transformRef.current.k)
        .translate(-match.x, -match.y!);
      transformRef.current = t;
    }
    draw();
  }, [search, draw]);

  /* ---- Toggle entity type visibility ---- */
  const toggleType = (slug: string) => {
    setTypeVisibility((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-900">
      {/* Canvas */}
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-20">
          <div className="text-center">
            <div className="text-white text-lg mb-2">Loading graph data...</div>
            <div className="text-gray-400 text-sm">
              Fetching entities and relationships
            </div>
          </div>
        </div>
      )}

      {/* Top-left: back link + stats */}
      <div className="absolute top-4 left-4 z-10">
        <Link
          href="/"
          className="inline-block px-3 py-1.5 bg-white/90 text-sm text-gray-700 rounded shadow hover:bg-white transition-colors"
        >
          ← Back to search
        </Link>
        {!loading && (
          <div className="mt-2 text-xs text-gray-400">
            {nodeCount} nodes · {edgeCount} edges
          </div>
        )}
      </div>

      {/* Control panel */}
      <div className="absolute top-4 right-4 z-10 w-64 bg-white/95 rounded shadow-lg p-4 space-y-4 text-sm">
        {/* Search */}
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Entity type toggles */}
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Entity Types
          </div>
          {SLUGS.map((slug) => (
            <label
              key={slug}
              className="flex items-center gap-2 py-0.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={typeVisibility[slug] !== false}
                onChange={() => toggleType(slug)}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: TYPE_COLORS[slug] }}
              />
              <span className="text-gray-700">{TYPE_LABELS[slug]}</span>
            </label>
          ))}
        </div>

        {/* Verification tier filter */}
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Verification Tier
          </div>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All tiers</option>
            <option value="verified">Verified</option>
            <option value="probable">Probable</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>

        {/* Legend */}
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Interactions
          </div>
          <div className="text-xs text-gray-500 space-y-0.5">
            <div>Click node → select &amp; highlight</div>
            <div>Double-click → open detail page</div>
            <div>Drag node → reposition</div>
            <div>Scroll → zoom in/out</div>
            <div>Drag background → pan</div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-30 pointer-events-none bg-white rounded shadow-lg border border-gray-200 px-3 py-2 text-sm"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 12,
          }}
        >
          <div className="font-medium text-gray-900">{tooltip.node.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: TYPE_COLORS[tooltip.node.entityType],
              }}
            />
            <span className="text-gray-500">
              {TYPE_LABELS[tooltip.node.entityType]}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                tooltip.node.verificationTier === "verified"
                  ? "bg-green-100 text-green-800"
                  : tooltip.node.verificationTier === "probable"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {tooltip.node.verificationTier}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {tooltip.node.connections} connection
            {tooltip.node.connections !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}