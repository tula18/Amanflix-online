import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Table, Input, Button, Tag, Space, Tooltip, Flex, notification, Checkbox, Form, Modal, Radio, message, Image, List } from "antd";
import { API_URL } from "../../../../config";
import { CheckOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, StopOutlined, UnlockOutlined } from "@ant-design/icons";
import QRCode from 'qrcode';
import JSZip from 'jszip';
import base64 from 'base-64';


const ManageUploadRequests = () => {
    const token = localStorage.getItem('admin_token');
    const [data, setData] = useState([]);
    const navigate = useNavigate();
    const [withDuplicates, setWithDuplicates] = useState(false)
    const [searchTerm, setSearchTerm] = useState('');
    // eslint-disable-next-line no-unused-vars
    const [searchedColumn, setSearchedColumn] = useState('');
    const [exportType, setExportType] = useState('json');


    const [isModalVisible, setIsModalVisible] = useState(false);
    const [qrCodeDataUrl, setQRCodeDataUrl] = useState(null);
    const [isQRModalVisible, setIsQRModalVisible] = useState(false);
    const [isQrCodeModalVisible, setIsQrCodeModalVisible] = useState(false);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);

    const [selectedQrCode, setSelectedQrCode] = useState(null);
    const [error, setError] = useState(null);
    const [qrCodes, setQrCodes] = useState([]);
    const [selectedChunk, setSelectedChunk] = useState(0);

    const showModal = () => {
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
    };

    const [form] = Form.useForm();

    const searchInput = useRef(null);

    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchTerm(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    }

    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchTerm('');
    }

    const deleteRequest = async (request) => {
        console.log(request);
        try {
            const res = await fetch(`${API_URL}/api/admin/uploadRequest/delete/${request.id}`, {
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
            getRequests()
        }
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

    const getRequests = async (with_duplicates = withDuplicates) => {
        try {
            console.log(with_duplicates);
            // if (withDuplicates == true) {
            //     with_duplicates = true
            // } else {
            //     with_duplicates = false
            // }
            
            const res = await fetch(`${API_URL}/api/admin/uploadRequests?with_duplicates=${with_duplicates}`, {
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

    const validateUploadRequests = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/uploadRequests/validate`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                notification.success({
                    message: data.message,
                    placement: "topRight",
                    duration: 0
                });
                // Reload the requests list
                getRequests();
            } else {
                const data = await res.json();
                notification.error({
                    message: data.message || 'Failed to validate upload requests',
                    placement: "topRight"
                });
            }
        } catch (error) {
            console.error('Error validating upload requests:', error);
            notification.error({
                message: 'Error validating upload requests. Please try again later.',
                placement: "topRight"
            });
        }
    }

    const getRequestsMemoized = useCallback(getRequests, [token])

    useEffect(() => {
        getRequestsMemoized()
    }, [token, getRequestsMemoized])


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
            title: 'Title ID',
            dataIndex: 'title_id',
            key: 'title_id',
            ...getColumnSearchProps('title_id')
        },
        {
            title: 'IMDB ID',
            dataIndex: 'imdb_id',
            key: 'imdb_id',
            ...getColumnSearchProps('imdb_id')
        },
        {
            title: 'Media Type',
            dataIndex: 'media_type',
            key: 'media_type',
            ...getColumnSearchProps('media_type')
        },
        ...(withDuplicates ? [
            {
                title: 'Username',
                dataIndex: 'username',
                key: 'username',
                ...getColumnSearchProps('username'),
                render: (_, record) => (
                    <p>{record.username}</p>
                )
            }
        ] : []),
        {
            title: 'Title',
            dataIndex: 'title',
            key: 'title',
            ...getColumnSearchProps('title')
        },
        {
            title: 'Count',
            dataIndex: 'count',
            key: 'count',
            sorter: {
                compare: (a,b) => a.count - b.count,
            }
        },
        {
            title: 'Backdrop Path',
            dataIndex: 'backdrop_path',
            key: 'backdrop_path',
        },
        {
            title: 'Release Date',
            dataIndex: 'release_date',
            key: 'release_date',
            sorter: (a, b) => {
                const dateA = new Date(a.release_date);
                const dateB = new Date(b.release_date);
        
                // Sort by time, then by date
                return dateA - dateB;
            },
            render: (_, { release_date }) => <p>{formatDateTime(release_date)}</p>
        },
        {
            title: 'Action',
            dataIndex: 'action',
            render: (_, record) => (
                <Flex justify={"center"} gap="small">
                    {/* <Tooltip  title={record.resolved ? "Reopen Report" : "Resolve Report"}>
                        <Button style={{borderColor: record.resolved ? "orange" : "green", color: record.resolved ? "orange" : "green"}} icon={record.resolved ? <ReloadOutlined/> : <CheckOutlined/>} onClick={() => record.resolved ? reopenBug(record) : resolveBug(record)}/>
                    </Tooltip> */}
                    <Tooltip title="Delete Request">
                        <Button icon={<DeleteOutlined/>} danger onClick={() => deleteRequest(record)}/>
                    </Tooltip>
                </Flex>
            )
        },
    ]

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

    const toggleDulplicates = () => {
        setWithDuplicates(!withDuplicates)
        getRequests(!withDuplicates)
    }

    const handleOk = () => {
        setWithDuplicates(false)
        getRequests(false)
        switch (exportType) {
            case 'json':
                exportToJson();
                break;
            case 'txt':
                exportToTxt();
                break;
            case 'qrcode':
                // exportToQRCode();
                handleGenerateQRCode();
                break;
            default:
                message.error('Invalid export type');
        }
        setIsModalVisible(false);
    };

    const exportToJson = () => {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('JSON file downloaded');
    };

    const exportToTxt = () => {
        const keys = ['title_id', 'title', 'count', 'media_type', 'release_date'];
        const header = keys.join(':?:');
        const rows = data.map(item => `${item.title_id}:?:${item.title}:?:${item.count}:?:${item.media_type}:?:${item.release_date}`).join('\n');
        const txtData = `${header}\n${rows}`
        
        const blob = new Blob([txtData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('TXT file downloaded');
    };

    const handleGenerateQRCode = async () => {
        try {
            console.log('Generating QR code...');
            const keys = ['title_id', 'title', 'count', 'media_type', 'release_date'];
            const header = keys.join(':?:');
            const rows = data.map(item => `${item.title_id}:?:${item.title}:?:${item.count}:?:${item.media_type}:?:${item.release_date}`).join('\n');
            const txtData = `${header}\n${rows}`;
    
            const zip = new JSZip();
            zip.file('data.txt', txtData);
            const zipData = await zip.generateAsync({ type: 'uint8array' });
    
            // Download the zipData
            const blob = new Blob([new Uint8Array(zipData)], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'data.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
    
            const response = await fetch(`${API_URL}/api/admin/read_files_as_hex`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                },
                body: JSON.stringify({ zip_data: Array.from(zipData) }),
            });
    
            if (!response.ok) {
                const error = await response.json();
                console.error('Error generating QR code:', error);
                return;
            }
    
            const result = await response.json();
            const base85String = result.base85_string;
            const checksum = result.checksum;

            console.log(`File read successfully. Base85 len: ${base85String.length} chars. Checksum: ${checksum}`);
    
            const chunks = splitHexString(base85String, 2950);
            createQrCodes(chunks, setError, setQrCodes);
            setIsQrCodeModalVisible(true);
        } catch (error) {
            console.error('Error generating QR code:', error);
            message.error('Failed to generate QR code');
        }
    };

    const handlePreviewQrCode = (index) => {
        console.log(`Previewing chunk ${qrCodes[index].chunkId}...`);
        setSelectedChunk(qrCodes[index].chunkId);
        setSelectedQrCode(qrCodes[index].qrCode);
        setIsPreviewModalVisible(true);
    };
    
    const splitHexString = (hexString, startChunkSize = 2048) => {
        console.log(`Splitting hex string into chunks of ${startChunkSize} chars...`);
        const hexLen = hexString.length;
        let currentChunk = 0;
        const chunks = [];

        while (currentChunk < hexLen) {
            console.log(currentChunk);
            const metadata = `chunk_${chunks.length}:?:`;
            const chunkSize = startChunkSize - metadata.length;
            currentChunk += chunkSize;
            const chunk = metadata + hexString.slice(currentChunk - chunkSize, currentChunk);
            chunks.push(chunk);
            console.log(`\rProcessing chunk ${chunks.length}, Starting: ${chunk.slice(0, 10)}... len: ${chunk.length} chunk len: ${chunkSize}`);
        }

        console.log(`\nTotal chunks created: ${chunks.length}`);
        return chunks;
    };
    
    const createQrCodes = (chunks, setError, setQrCodes) => {
        console.log('Creating QR codes...');
        const qrCodesArray = [];
        chunks.forEach((chunk, index) => {
            console.log(`Chunk ${index + 1}/${chunks.length}: Start: ${chunk.split(':?:')[1].slice(0, 10)}... ${chunk.slice(-10)}`);
            const chunkId = chunk.split(':?:')[0].split('_')[1];
            QRCode.toDataURL(chunk, { errorCorrectionLevel: 'L' })
                .then((dataUrl) => {
                    console.log(`QR code for chunk ${chunkId} generated successfully.`);
                    qrCodesArray.push({ chunkId, qrCode: dataUrl });
                    if (index === chunks.length - 1) {
                        console.log('All QR codes generated successfully.');
                        setQrCodes(qrCodesArray);
                    }
                })
                .catch((error) => {
                    console.error(`Error generating QR code for chunk ${chunkId}:`, error);
                    setError(`Error generating QR code for chunk ${chunkId}: ${error.message}`);
                });
        });
    };

    const handleDownloadAllQRCode = () => {
        const zip = new JSZip();
        qrCodes.forEach((qrCode) => {
            zip.file(`qr_${qrCode.chunkId}.png`, fetch(qrCode.qrCode).then((res) => res.blob()));
        });
        zip.generateAsync({ type: 'blob' })
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'qr_codes.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            })
            .catch((error) => {
                console.error('Error downloading all QR codes:', error);
            });
    };
    
    const handleDownloadQRCode = () => {
        const url = selectedQrCode;
        const a = document.createElement('a');
        a.href = url;
        a.download = `qr_${selectedChunk}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "10px"}}>
                <h1>Manage Upload Requests</h1>
                <h2>{data.length} Requests</h2>
                <Flex gap={"5px"}>
                    <Tooltip title="Toggle With duplicates or not">
                        <Button type={withDuplicates ? "primary" : "default"} onClick={toggleDulplicates}style={{
                            width: 150,
                        }}>
                            {withDuplicates ? "With Duplicates" : "Without Duplicates"}
                        </Button>
                    </Tooltip>
                    <Button type="primary" onClick={showModal}>
                        Export
                    </Button>
                    <Tooltip title="Validate and remove requests for already uploaded titles">
                        <Button 
                            type="primary" 
                            icon={<CheckOutlined />}
                            onClick={validateUploadRequests}
                            style={{
                                backgroundColor: '#52c41a',
                                borderColor: '#52c41a',
                            }}
                        >
                            Validate Requests
                        </Button>
                    </Tooltip>
                    <Tooltip title="Reload List">
                        <Button
                        type="primary"
                        onClick={(e) => getRequests()}
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
              className="custom-table" 
            />
            <Modal
                title="Export to"
                visible={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <Radio.Group value={exportType} onChange={e => setExportType(e.target.value)}>
                    <Radio value="json">JSON</Radio>
                    <Radio value="txt">TXT</Radio>
                    <Radio value="qrcode">QR Code</Radio>
                </Radio.Group>
            </Modal>
            <Modal
                title="QR Code"
                visible={isQrCodeModalVisible}
                onCancel={() => setIsQrCodeModalVisible(false)}
                width={800}
                centered
                footer={[
                    <Button type="primary" onClick={handleDownloadAllQRCode}>
                        Download All
                    </Button>,
                    <Button key="back" type="primary" onClick={() => setIsQrCodeModalVisible(false)}>
                        Close
                    </Button>
                ]}
                >
                <Table
                    columns={[
                        {
                            title: 'Chunk',
                            dataIndex: 'chunkId',
                            key: 'chunkId',
                        },
                        {
                            title: 'QR Code',
                            dataIndex: 'qrCode',
                            key: 'qrCode',
                            render: (qrCode, record) => (
                                <Flex>
                                    <Image src={qrCode} width={100} style={{ objectFit: 'contain' }} onClick={() => handlePreviewQrCode(record.chunkId, qrCode)} />
                                    <Button type="link" icon={<SearchOutlined />} onClick={() => handlePreviewQrCode(record.chunkId, qrCode)}>
                                        Preview
                                    </Button>
                                </Flex>
                            ),
                        },
                    ]}
                    dataSource={qrCodes.map((qrCode, index) => ({ ...qrCode, key: index }))}
                    pagination={false}
            />
                
            </Modal>
            <Modal
                title={`QR Code Preview - Chunk ${selectedChunk}`}
                visible={isPreviewModalVisible}
                onCancel={() => setIsPreviewModalVisible(false)}
                width={'60%'}
                // height={'100%'}
                centered
                footer={[
                    <Button key="back" type="primary" onClick={() => setIsPreviewModalVisible(false)}>
                        Close
                    </Button>,
                ]}
            >
                <Flex direction="column" align="center" justify="center" style={{ height: '100%' }}>
                    <Image src={selectedQrCode} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </Flex>
            </Modal>
        </Flex>
    )
}

export default ManageUploadRequests