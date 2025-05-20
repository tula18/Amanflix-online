import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Table, Input, Button, Tag, Space, Tooltip, Flex, notification } from "antd";
import { API_URL } from "../../../../config";
import { CheckOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, StopOutlined, UnlockOutlined } from "@ant-design/icons";

const UnresolvedBugs = () => {
    const token = localStorage.getItem('admin_token');
    const [data, setData] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    // eslint-disable-next-line no-unused-vars
    const [searchedColumn, setSearchedColumn] = useState('');
    const navigate = useNavigate();

    const searchInput = useRef(null);

    function formatDateTime(dateTime, showTime = false) {
        const date = new Date(dateTime);
    
        const dayOfWeek = date.toLocaleString('en-US', { weekday: 'short' });
        const monthName = date.toLocaleString('en-US', { month: 'short' });
        const day = date.getDate();
    
        if (showTime) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()} ${hours}:${minutes}`;
        } else {
            return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()}`;
        }
    }

    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchTerm(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    }

    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchTerm('');
    }

    const getColumnSearchProps = (dataIndex) => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
            <div style={{
                padding: 8,
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
                <Input
                  ref={searchInput}
                  placeholder={`Search ${dataIndex}`}
                  value={selectedKeys[0]}
                  onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                  onPressEnter={(e) => handleSearch(selectedKeys, confirm, dataIndex)}
                  style={{
                    marginBottom: 8,
                    display: "block",
                  }}
                />
                <Space>
                    <Button
                      type="primary"
                      onClick={(e) => handleSearch(selectedKeys, confirm, dataIndex)}
                      icon={<SearchOutlined/>}
                      size={"small"}
                      style={{
                        width: 90,
                      }}
                    >
                        Search
                    </Button>
                    <Button
                      onClick={() => clearFilters && handleReset(clearFilters)}
                      size={"small"}
                      style={{
                        width: 90,
                      }}
                    >
                        Reset
                    </Button>
                    <Button
                      type="link"
                      size={"small"}
                      onClick={() => {
                        confirm({
                            closeDropdown: false,
                        });
                        setSearchTerm(selectedKeys[0]);
                        setSearchedColumn(dataIndex)
                      }}
                    >
                        Filter
                    </Button>
                    <Button
                      type="link"
                      size={"small"}
                      onClick={() => {
                        close();
                      }}
                    >
                        close
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered) => (
            <SearchOutlined style={{color: filtered ? '#1677ff' : undefined}}/>
        ),
        onFilter: (value, record) => record[dataIndex].toString().toLowerCase().includes(value.toLowerCase()),
        onFilterDropdownChange: (visible) => {
            if (visible) {
                setTimeout(() => searchInput.current?.select(), 100);
            }
        },
    })

    const deleteBug = async (report) => {
        console.log(report);
        try {
            const res = await fetch(`${API_URL}/api/admin/bugs/${report.id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                notification.success({message: data.message, placement: "topLeft"})
            } else {
                const data = await res.json();
                notification.error({message: data.message, placement: "topLeft"})
            }
        } catch {
            notification.error({message: 'Error deleting report. Please try again later.', placement: "topLeft"})
        } finally {
            getBugs()
        }
    }

    const resolveBug = async (report) => {
        console.log(report);
        try {
            const res = await fetch(`${API_URL}/api/admin/bugs/${report.id}/resolve`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                notification.success({message: data.message, placement: "topLeft"})
            } else {
                const data = await res.json();
                notification.error({message: data.message, placement: "topLeft"})
            }
        } catch {
            notification.error({message: 'Error resolveing report. Please try again later.', placement: "topLeft"})
        } finally {
            getBugs()
        }
    }

    const reopenBug = async (report) => {
        console.log(report);
        try {
            const res = await fetch(`${API_URL}/api/admin/bugs/${report.id}/reopen`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                notification.success({message: data.message, placement: "topLeft"})
            } else {
                const data = await res.json();
                notification.error({message: data.message, placement: "topLeft"})
            }
        } catch {
            notification.error({message: 'Error reopening report. Please try again later.', placement: "topLeft"})
        } finally {
            getBugs()
        }
    }

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            sorter: {
                compare: (a,b) => a.id - b.id,
            }
        },
        {
            title: 'Reporter',
            dataIndex: 'reporter',
            key: 'reporter',
            ...getColumnSearchProps('reporter')
        },
        {
            title: 'Title',
            dataIndex: 'title',
            key: 'title',
            ...getColumnSearchProps('title')
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            ...getColumnSearchProps('description')
        },
        {
            title: 'Resolved',
            dataIndex: 'resolved',
            key: 'resolved',
            sorter: {
                compare: (a,b) => a.resolved - b.resolved
            },
            render: (_, { resolved }) => (
                <>
                    <Tooltip title={resolved ? `Bug is resolved` : "Bug is not resolved"}>
                        <Tag color={resolved ? 'green' : 'red'}>
                            {resolved ? "Resolved" : "Not Resolved"}
                        </Tag>
                    </Tooltip>

                </>
            )
        },
        {
            title: 'Created at',
            dataIndex: 'created_at',
            key: 'created_at',
            sorter: (a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
        
                // Sort by time, then by date
                return dateA - dateB;
            },
            render: (_, { created_at }) => <p>{formatDateTime(created_at)}</p>
        },
        {
            title: 'Action',
            dataIndex: 'action',
            render: (_, record) => (
                <Flex justify={"center"} gap="small">
                    <Tooltip  title={record.resolved ? "Reopen Report" : "Resolve Report"}>
                        <Button style={{borderColor: record.resolved ? "orange" : "green", color: record.resolved ? "orange" : "green"}} icon={record.resolved ? <ReloadOutlined/> : <CheckOutlined/>} onClick={() => record.resolved ? reopenBug(record) : resolveBug(record)}/>
                    </Tooltip>
                    <Tooltip title="Delete Report">
                        <Button icon={<DeleteOutlined/>} danger onClick={() => deleteBug(record)}/>
                    </Tooltip>
                </Flex>
            )
        },
    ]

    const getBugs = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/bugs`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                console.log(data);
                setData(data)
            }
        } catch (error) {
            console.error('Error validating token:', error);
        }
    }

    const getBugsMemoized = useCallback(getBugs, [token])

    useEffect(() => {
        getBugsMemoized()
    }, [token, getBugsMemoized])

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "10px"}}>
                <h1>Manage Bug Reports</h1>
                <h2>{data.length} Bug Reports</h2>
                <Flex gap={"5px"}>
                    <Tooltip title="Reload List">
                        <Button
                        type="primary"
                        onClick={getBugs}
                        style={{
                            width: 90,
                        }}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Flex>
            </Flex>
            <Table
              dataSource={data}
              columns={columns}
              pagination={{pageSize:10}}
              className="custom-table" 
            />
        </Flex>
    )
}

export default UnresolvedBugs