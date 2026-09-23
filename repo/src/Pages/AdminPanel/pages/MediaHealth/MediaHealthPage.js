import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Button,
    Card,
    Empty,
    Modal,
    Progress,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    notification,
} from "antd";
import {
    CheckCircleOutlined,
    DeleteOutlined,
    InboxOutlined,
    MedicineBoxOutlined,
    ReloadOutlined,
    ScanOutlined,
    ToolOutlined,
    UndoOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { API_URL } from "../../../../config";
import "./MediaHealthPage.css";

const { Title, Text, Paragraph } = Typography;
const { confirm } = Modal;

const BASE = `${API_URL}/api/admin/media-health`;
const POLL_INTERVAL = 1000;

// Every issue the scan can report, with the wording shown to an operator.
const ISSUE_META = {
    corrupt_display_matrix: {
        label: "Corrupt display matrix",
        color: "red",
        help: "The video track's rotation matrix is degenerate (nan). Chrome 143+ refuses to render it, so the title plays as a black screen with working audio. Repaired by a lossless remux.",
    },
    missing_file: {
        label: "File missing",
        color: "red",
        help: "This title is in the database but has no video file on disk. Re-upload it.",
    },
    no_video_stream: {
        label: "No video stream",
        color: "red",
        help: "The file contains no video track at all.",
    },
    unreadable: {
        label: "Unreadable",
        color: "red",
        help: "The container could not be parsed. The file is likely truncated or corrupt.",
    },
    not_faststart: {
        label: "Not faststart",
        color: "gold",
        help: "The moov atom sits after the media data, so browsers must download more before playback starts. Repaired by a lossless remux.",
    },
};

const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const MediaHealthPage = () => {
    const token = localStorage.getItem("admin_token");

    const [scope, setScope] = useState("all");
    const [scan, setScan] = useState({ state: "idle", scanned: 0, total: 0 });
    const [results, setResults] = useState([]);
    const [generatedAt, setGeneratedAt] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [repair, setRepair] = useState({ state: "idle", processed: 0, total: 0, results: [] });
    const [backups, setBackups] = useState({ backups: [], count: 0, total_size: 0 });
    const [restoringName, setRestoringName] = useState(null);
    const [loading, setLoading] = useState(true);

    // Poll timers, cleared on unmount so a finished page stops hitting the API.
    const scanTimer = useRef(null);
    const repairTimer = useRef(null);

    const authFetch = useCallback(
        (path, options = {}) =>
            fetch(`${BASE}${path}`, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    ...(options.headers || {}),
                },
            }),
        [token]
    );

    const loadBackups = useCallback(async () => {
        try {
            const res = await authFetch("/backups");
            if (res.ok) setBackups(await res.json());
        } catch {
            /* non-critical panel; leave the previous value in place */
        }
    }, [authFetch]);

    const loadReport = useCallback(async () => {
        try {
            const res = await authFetch("/report");
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
                setGeneratedAt(data.generated_at);
            }
        } catch {
            notification.error({ message: "Could not load the last scan report." });
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    const pollScan = useCallback(() => {
        scanTimer.current = setTimeout(async function tick() {
            try {
                const res = await authFetch("/scan/status");
                const data = await res.json();
                setScan(data);

                if (data.state === "running") {
                    scanTimer.current = setTimeout(tick, POLL_INTERVAL);
                    return;
                }

                if (data.state === "done") {
                    setResults(data.results || []);
                    const flagged = (data.results || []).filter((r) => r.issues.length).length;
                    notification.success({
                        message: "Scan complete",
                        description: `${flagged} of ${data.scanned} file(s) flagged.`,
                    });
                } else if (data.state === "failed") {
                    notification.error({ message: "Scan failed", description: data.error });
                }
            } catch {
                notification.error({ message: "Lost contact with the scan." });
            }
        }, POLL_INTERVAL);
    }, [authFetch]);

    const pollRepair = useCallback(() => {
        repairTimer.current = setTimeout(async function tick() {
            try {
                const res = await authFetch("/repair/status");
                const data = await res.json();
                setRepair(data);

                if (data.state === "running") {
                    repairTimer.current = setTimeout(tick, POLL_INTERVAL);
                    return;
                }

                const repaired = (data.results || []).filter((r) => r.repaired).length;
                const failed = (data.results || []).length - repaired;
                notification[failed ? "warning" : "success"]({
                    message: "Repair finished",
                    description: `${repaired} repaired, ${failed} failed.`,
                });
                setSelectedIds([]);
                loadReport();
                loadBackups();
            } catch {
                notification.error({ message: "Lost contact with the repair job." });
            }
        }, POLL_INTERVAL);
    }, [authFetch, loadReport, loadBackups]);

    useEffect(() => {
        loadReport();
        loadBackups();
        return () => {
            clearTimeout(scanTimer.current);
            clearTimeout(repairTimer.current);
        };
    }, [loadReport, loadBackups]);

    const startScan = async () => {
        try {
            const res = await authFetch("/scan/start", {
                method: "POST",
                body: JSON.stringify({ scope }),
            });
            if (res.status === 409) {
                notification.warning({ message: "A scan is already running." });
                pollScan();
                return;
            }
            if (!res.ok) throw new Error();
            setScan({ state: "running", scanned: 0, total: 0 });
            setSelectedIds([]);
            pollScan();
        } catch {
            notification.error({ message: "Could not start the scan." });
        }
    };

    const startRepair = (videoIds) => {
        if (!videoIds.length) return;
        confirm({
            title: `Repair ${videoIds.length} file(s)?`,
            icon: <ToolOutlined />,
            content:
                "Each file is backed up before it is replaced, and the repaired copy is verified " +
                "before the swap. Playback of these titles is paused while they are rewritten.",
            okText: "Repair",
            onOk: async () => {
                try {
                    const res = await authFetch("/repair", {
                        method: "POST",
                        body: JSON.stringify({ video_ids: videoIds }),
                    });
                    if (res.status === 409) {
                        notification.warning({ message: "A repair run is already in progress." });
                        pollRepair();
                        return;
                    }
                    if (!res.ok) throw new Error();
                    setRepair({ state: "running", processed: 0, total: videoIds.length, results: [] });
                    pollRepair();
                } catch {
                    notification.error({ message: "Could not start the repair." });
                }
            },
        });
    };

    const restoreBackup = (backup) => {
        confirm({
            title: "Restore this backup?",
            icon: <UndoOutlined />,
            content: (
                <>
                    <p>
                        <strong>{backup.name}</strong> will overwrite the current file for video{" "}
                        {backup.video_id}.
                    </p>
                    <p>
                        The file being replaced is discarded and cannot be recovered. The backup
                        itself is kept, so you can restore from it again. Playback of this title is
                        paused while the file is written.
                    </p>
                </>
            ),
            okText: "Overwrite",
            okButtonProps: { danger: true },
            onOk: async () => {
                setRestoringName(backup.name);
                try {
                    const res = await authFetch("/backups/restore", {
                        method: "POST",
                        body: JSON.stringify({ name: backup.name }),
                    });
                    const data = await res.json();

                    if (res.status === 409) {
                        notification.warning({ message: "That title is currently being processed." });
                        return;
                    }
                    if (!res.ok) {
                        notification.error({
                            message: "Restore failed",
                            description: data.message || "The backup could not be restored.",
                        });
                        return;
                    }

                    notification.success({
                        message: "Backup restored",
                        description: `Video ${backup.video_id} was overwritten with ${backup.name}.`,
                    });
                    loadReport();
                    loadBackups();
                } catch {
                    notification.error({ message: "Could not restore the backup." });
                } finally {
                    setRestoringName(null);
                }
            },
        });
    };

    const pruneBackups = () => {
        confirm({
            title: "Prune backups older than 14 days?",
            icon: <WarningOutlined />,
            content: "These are the only pre-repair copies of those files. This cannot be undone.",
            okText: "Prune",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    const res = await authFetch("/backups/prune", {
                        method: "POST",
                        body: JSON.stringify({ max_age_days: 14 }),
                    });
                    if (res.status === 403) {
                        notification.error({
                            message: "Not permitted",
                            description: "Pruning backups requires an admin account.",
                        });
                        return;
                    }
                    const data = await res.json();
                    notification.success({
                        message: `Pruned ${data.deleted} backup(s)`,
                        description: `${formatBytes(data.freed)} freed.`,
                    });
                    loadBackups();
                } catch {
                    notification.error({ message: "Could not prune backups." });
                }
            },
        });
    };

    const flagged = results.filter((r) => r.issues && r.issues.length);
    const blocking = flagged.filter((r) => r.blocking);
    const repairable = flagged.filter((r) => r.repairable);
    const scanning = scan.state === "running";
    const repairing = repair.state === "running";

    const columns = [
        {
            title: "Title",
            dataIndex: "title",
            key: "title",
            render: (title, row) => (
                <div>
                    <div>{title}</div>
                    {row.subtitle ? <Text type="secondary">{row.subtitle}</Text> : null}
                </div>
            ),
            sorter: (a, b) => a.title.localeCompare(b.title),
        },
        {
            title: "Type",
            dataIndex: "type",
            key: "type",
            width: 100,
            filters: [
                { text: "Movie", value: "movie" },
                { text: "Episode", value: "episode" },
            ],
            onFilter: (value, row) => row.type === value,
            render: (type) => <Tag>{type}</Tag>,
        },
        { title: "Video ID", dataIndex: "video_id", key: "video_id", width: 110 },
        {
            title: "Issues",
            dataIndex: "issues",
            key: "issues",
            render: (issues) => (
                <Space size={[0, 4]} wrap>
                    {issues.map((issue) => {
                        const meta = ISSUE_META[issue] || { label: issue, color: "default", help: "" };
                        return (
                            <Tooltip key={issue} title={meta.help}>
                                <Tag color={meta.color}>{meta.label}</Tag>
                            </Tooltip>
                        );
                    })}
                </Space>
            ),
        },
        {
            title: "Size",
            key: "size",
            width: 100,
            render: (_, row) => formatBytes(row.details?.size),
            sorter: (a, b) => (a.details?.size || 0) - (b.details?.size || 0),
        },
        {
            title: "Action",
            key: "action",
            width: 110,
            render: (_, row) =>
                row.repairable ? (
                    <Button
                        size="small"
                        icon={<ToolOutlined />}
                        disabled={repairing}
                        onClick={() => startRepair([row.video_id])}
                    >
                        Repair
                    </Button>
                ) : (
                    <Tooltip title="This issue cannot be fixed by a remux.">
                        <Button size="small" disabled>
                            Repair
                        </Button>
                    </Tooltip>
                ),
        },
    ];

    return (
        <div className="media-health-page">
            <div className="media-health-header">
                <div>
                    <Title level={2}>
                        <MedicineBoxOutlined /> Media Health
                    </Title>
                    <Text type="secondary">
                        Scan stored video files for container defects and repair them losslessly.
                    </Text>
                </div>
                <Space>
                    <Select
                        value={scope}
                        onChange={setScope}
                        disabled={scanning}
                        style={{ width: 140 }}
                        options={[
                            { value: "all", label: "Everything" },
                            { value: "movies", label: "Movies only" },
                            { value: "shows", label: "Episodes only" },
                        ]}
                    />
                    <Button
                        type="primary"
                        icon={<ScanOutlined />}
                        loading={scanning}
                        onClick={startScan}
                    >
                        {scanning ? "Scanning..." : "Scan library"}
                    </Button>
                    <Tooltip title="Reload the last saved report">
                        <Button icon={<ReloadOutlined />} onClick={loadReport} disabled={scanning} />
                    </Tooltip>
                </Space>
            </div>

            {scanning && (
                <Card className="media-health-progress">
                    <Progress
                        percent={scan.total ? Math.round((scan.scanned / scan.total) * 100) : 0}
                        status="active"
                    />
                    <Text type="secondary">
                        Scanned {scan.scanned} of {scan.total || "?"}
                        {scan.current ? ` - ${scan.current}` : ""}
                    </Text>
                </Card>
            )}

            {repairing && (
                <Card className="media-health-progress">
                    <Progress
                        percent={repair.total ? Math.round((repair.processed / repair.total) * 100) : 0}
                        status="active"
                        strokeColor="#faad14"
                    />
                    <Text type="secondary">
                        Repairing {repair.processed} of {repair.total}
                        {repair.current ? ` - video ${repair.current}` : ""}
                    </Text>
                </Card>
            )}

            <div className="media-health-summary">
                <Card>
                    <Text type="secondary">Files checked</Text>
                    <Title level={3}>{results.length}</Title>
                </Card>
                <Card>
                    <Text type="secondary">Unplayable</Text>
                    <Title level={3} className={blocking.length ? "stat-bad" : "stat-good"}>
                        {blocking.length}
                    </Title>
                </Card>
                <Card>
                    <Text type="secondary">Flagged</Text>
                    <Title level={3} className={flagged.length ? "stat-warn" : "stat-good"}>
                        {flagged.length}
                    </Title>
                </Card>
                <Card>
                    <Text type="secondary">Repairable</Text>
                    <Title level={3}>{repairable.length}</Title>
                </Card>
            </div>

            <Card
                title="Flagged files"
                extra={
                    <Space>
                        {generatedAt && (
                            <Text type="secondary">
                                Last scan: {new Date(generatedAt).toLocaleString()}
                            </Text>
                        )}
                        <Button
                            disabled={!selectedIds.length || repairing}
                            icon={<ToolOutlined />}
                            onClick={() => startRepair(selectedIds)}
                        >
                            Repair selected ({selectedIds.length})
                        </Button>
                        <Button
                            type="primary"
                            disabled={!repairable.length || repairing}
                            icon={<ToolOutlined />}
                            onClick={() => startRepair(repairable.map((r) => r.video_id))}
                        >
                            Repair all repairable ({repairable.length})
                        </Button>
                    </Space>
                }
            >
                {!loading && !flagged.length ? (
                    <Empty
                        image={<CheckCircleOutlined className="media-health-empty-icon" />}
                        description={
                            generatedAt
                                ? "No problems found in the last scan."
                                : "No scan has been run yet."
                        }
                    />
                ) : (
                    <Table
                        rowKey="video_id"
                        loading={loading}
                        dataSource={flagged}
                        columns={columns}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        rowSelection={{
                            selectedRowKeys: selectedIds,
                            onChange: setSelectedIds,
                            getCheckboxProps: (row) => ({ disabled: !row.repairable }),
                        }}
                    />
                )}
            </Card>

            <Card
                className="media-health-backups"
                title={
                    <span>
                        <InboxOutlined /> Pre-repair backups
                    </span>
                }
                extra={
                    <Space>
                        <Text type="secondary">
                            {backups.count} file(s), {formatBytes(backups.total_size)}
                        </Text>
                        <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            disabled={!backups.count}
                            onClick={pruneBackups}
                        >
                            Prune older than 14 days
                        </Button>
                    </Space>
                }
            >
                <Paragraph type="secondary" className="media-health-note">
                    Every repair moves the original here before replacing it. Keep them until you have
                    confirmed the repaired titles play correctly.
                </Paragraph>
                <Table
                    rowKey="name"
                    size="small"
                    dataSource={backups.backups}
                    pagination={{ pageSize: 5, hideOnSinglePage: true }}
                    columns={[
                        { title: "File", dataIndex: "name", key: "name" },
                        { title: "Video ID", dataIndex: "video_id", key: "video_id", width: 120 },
                        {
                            title: "Size",
                            dataIndex: "size",
                            key: "size",
                            width: 100,
                            render: formatBytes,
                        },
                        {
                            title: "Created",
                            dataIndex: "modified",
                            key: "modified",
                            width: 200,
                            render: (value) => new Date(value).toLocaleString(),
                        },
                        {
                            title: "Action",
                            key: "action",
                            width: 120,
                            render: (_, row) => (
                                <Tooltip title="Overwrite the current file with this backup">
                                    <Button
                                        size="small"
                                        icon={<UndoOutlined />}
                                        loading={restoringName === row.name}
                                        disabled={repairing || Boolean(restoringName && restoringName !== row.name)}
                                        onClick={() => restoreBackup(row)}
                                    >
                                        Restore
                                    </Button>
                                </Tooltip>
                            ),
                        },
                    ]}
                />
            </Card>
        </div>
    );
};

export default MediaHealthPage;
