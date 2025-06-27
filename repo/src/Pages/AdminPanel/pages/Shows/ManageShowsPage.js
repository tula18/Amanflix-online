import { CloseOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { Button, Flex, Input, Select, Tooltip, notification } from "antd";
import React, { useCallback, useEffect, useState } from "react";
import { API_URL } from "../../../../config";
import Card from "../../../../Components/Card/Card";
import TvShowEditModal from "./ShowModal/ShowModal";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

// Add this new component
const DeleteShow = ({onClose, show_id, show_name, refresh}) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const toggle = () => {
        onClose();
    };

    async function handleDeleteShow() {
        setLoading(true);
    
        try {
            const formData = new FormData();
            formData.append('password', password);
    
            const response = await fetch(`${API_URL}/api/upload/show/delete/${show_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                },
                body: formData
            });
    
            const json = await response.json();
    
            if (response.status === 200) {
                notification.success({message: json.message, duration: 0});
                onClose();
            } else {
                notification.error({message: json.message, duration: 0});
                setLoading(false);
            }
        } catch (error) {
            console.error("Error deleting show:", error);
            notification.error({message: 'Error deleting show. Please try again later.', duration: 0});
            setLoading(false);
        } finally {
            setLoading(false);
            refresh();
        }
    }

    const handleToggle = () => {
        setPassword('');
        toggle();
    };

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Delete Show: {show_name} ({show_id})</h4>
                <p>Are you sure you want to delete this TV show? This action is irreversible.</p>
                <div className="form-group">
                    <input 
                        type={passwordVisible ? 'text' : 'password'}
                        id="password"
                        placeholder="Write your Admin Password"
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <span className="profile_eye-icon-wrapper">
                        {passwordVisible ? <FaEyeSlash className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} /> : <FaEye className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} />}
                    </span>
                </div>
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={handleToggle}>
                        Cancel
                    </button>
                    <button type="button" className="profile_delete_btn" onClick={handleDeleteShow}>
                        {loading ? "Deleting..." : "Delete Show"}
                    </button>
                </div>
            </div>
        </div>
    );
};

function NewCard() {
    return (
        <div className='newCard'>
            {/* <img ref={imgRef} onError={handleError} loading={"lazy"} onLoadStart={() => setIsLoading(true)} onLoad={() => setIsLoading(false)} className='card__image' draggable="false" src={imgSrc} alt='' srcSet=''/> */}
            <Flex justify="center" align="center" style={{position: "relative", height: "100%"}}>
                <PlusCircleOutlined style={{fontSize: "44px"}}/>
            </Flex>
            <h2>Add new Show</h2>
        </div>
    )
}

const ManageShows = () => {
    const [shows, setShows] = useState([]);
    const [selectedShow, setSelectedShow] = useState(undefined);
    const [ShowName, setShowName] = useState(undefined);
    const [query, setQuery] = useState('');
    const [fetchType, setFetchType] = useState('cdn');
    const [showType, setShowType] = useState('api');
    const [loadingShows, setLoadingShows] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const { Option } = Select;

    const fetchShows = async () => {
        if (query) {
            try {
                setShowType(fetchType)
                setLoadingShows(true)
                const newQuery = decodeURIComponent(query)
                console.log(fetchType);
                const res = await fetch(`${API_URL}/${fetchType}/search?q=${encodeURIComponent(newQuery)}&max_results=49&media_type=tv`)
                const data = await res.json();
                if (!res.ok) {
                    console.error({message: data.error})
                    return
                }
                console.log(data);
                setShows(data)
            } catch (error) {
                console.error('Error validating token:', error);
            } finally {
                setLoadingShows(false)
            }
        } else {
            try {
                // setShows([])
                setShowType('api')
                setLoadingShows(true)
                const res = await fetch(`${API_URL}/api/shows?per_page=10000`)
                const data = await res.json();
                console.log(data);
                if (!res.ok) {
                    console.error({message: data.error})
                    return
                }
                setShows(data)
            } catch (error) {
                console.error('Error validating token:', error);
            } finally {
                setLoadingShows(false)
            }
        }
    }

    const fetchShowsMemoized = useCallback(fetchShows, [query])

    useEffect(() => {
        fetchShowsMemoized();
    }, [query, fetchType, fetchShowsMemoized])

    const handleShowClick = (event, show) => {
        console.log("Clicked show object:", show);
        console.log("Show ID value:", show?.show_id);
        console.log("Selected show before setting:", selectedShow);
        
        if (typeof(show) === "object") {
            setSelectedShow(show.show_id);
            console.log("Set selected show to:", show.show_id);
        }
        setShowEditModal(true);
        console.log("showType set to:", fetchType);
        
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    };

    const handleModalClose = () => {
        setSelectedShow(undefined);
        setShowEditModal(false);
        fetchShows();
    };

    useEffect(() => {
        if (showEditModal) {
          document.body.classList.add('no-scroll');
        } else {
          document.body.classList.remove('no-scroll');
        }
  
      }, [showEditModal])

    const fetchTypeOpt = [
        {value: 'cdn', label: 'CDN', title: "See all the Titles"},
        {value: 'api', label: 'API', title: "See only uploaded Titles"},
    ]

    const handleDelOpen = (show_id, show_name) => {
        setShowEditModal(false);
        setSelectedShow(show_id);
        setShowName(show_name);
        setShowDeleteModal(true);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
        fetchShows();
    };

    const handleDelClose = () => {
        setShowDeleteModal(false);
        setSelectedShow(undefined);
        fetchShows();
    };

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "20px"}}>
                <h1>Manage Shows</h1>
                <Flex gap={"5px"}>
                    <Select className="Movies_search_select" defaultValue={"cdn"} onChange={(val) => {
                        setFetchType(val)
                        setQuery('')
                        }}>
                        {fetchTypeOpt.map((item) => (
                            <Option key={item.value} value={item.value}><Tooltip title={item.title}>{item.label}</Tooltip></Option>
                        ))}
                    </Select>
                    <Input
                        placeholder={`Search Shows from ${fetchType.toUpperCase()}`}
                        className="Movies_search_input"
                        style={{
                            width: 300,
                        }}
                        autoComplete="none"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            e.stopPropagation()
                        }}
                    />
                    {query && query.trim() !== '' && (<Tooltip title="Clear the Input"><Button onClick={(e) => {
                                    setQuery('');
                                    e.preventDefault();
                                }}>
                        <CloseOutlined/>
                    </Button></Tooltip>)}
                    <Tooltip title={`Reload List from ${fetchType.toUpperCase()}`}>
                        <Button
                        type="primary"
                        loading={loadingShows}
                        onClick={fetchShows}
                        style={{
                            width: 90,
                        }}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Flex>
            </Flex>
            <div className="grid">
                <span>
                    <button className="button3" onClick={(e) => {
                        handleShowClick(e)
                        setShowType('new')
                        }}>
                        <NewCard/>
                    </button>
                </span>
                {shows.map((show, idx) => (
                    <span key={idx}>
                        <button className="button3" onClick={(e) => handleShowClick(e, show)}>
                            <Card movie={show}></Card>
                        </button>
                    </span>
                ))}
            </div>
            {showEditModal && (
                <TvShowEditModal
                    onClose={handleModalClose}
                    ShowID={selectedShow}
                    openDelForm={handleDelOpen}
                    refresh={fetchShows}
                    fetchType={showType}
                />
            )}
            {showDeleteModal && (
                <DeleteShow
                    onClose={handleDelClose}
                    show_id={selectedShow}
                    show_name={ShowName}
                    refresh={fetchShows}
                />
            )}
        </Flex>
    )
}

export default ManageShows