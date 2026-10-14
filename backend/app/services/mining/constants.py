EDA_FILENAME = "eda_summary.json"
ASSOCIATION_RULES_FILENAME = "association_rules.json"
CLUSTERS_FILENAME = "clusters.json"
GRAPH_FILENAME = "graph_coauthorship.json"
TRENDS_FILENAME = "trends_anomalies.json"
MANIFEST_FILENAME = "mining_manifest.json"

ARTIFACT_NOT_FOUND_MESSAGE = (
    "Mining artifact '{filename}' not found. Run Python mining engine first."
)

FALLBACK_ARTIFACT_DIR = ("data", "gold", "mining")

MANIFEST_STANDBY_STATUS = "STANDBY"
MANIFEST_STANDBY_TOTAL_PAPERS = 10000

TELEMETRY_DEFAULT_STATUS = "READY"
TELEMETRY_DEFAULT_EXECUTION_SECONDS = 64.56
TELEMETRY_TOTAL_PAPERS = 10000
TELEMETRY_INTERVAL_SECONDS = 3
