// SeasonEpisodeEditor.js
import React, { useState, useEffect } from 'react';
import { Collapse, Button, Table, Form, Input, InputNumber, DatePicker, Space, Tabs, Select, Tag, Tooltip, Popconfirm, Empty } from 'antd';
import { DeleteOutlined, PlusOutlined, CaretRightOutlined, ArrowUpOutlined, ArrowDownOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import TextArea from "antd/es/input/TextArea";
import './SeasonEpisodeEditor.css'; // We'll create this CSS file next

const { Panel } = Collapse;
const { TabPane } = Tabs;
const { Option } = Select;

const SeasonEpisodeEditor = ({ value, onChange }) => {
  const [seasons, setSeasons] = useState(Array.isArray(value) ? value : []);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [activeTab, setActiveTab] = useState({});
  const [stats, setStats] = useState({ totalEpisodes: 0, totalRuntime: 0 });

  useEffect(() => {
    if (Array.isArray(value)) {
      setSeasons(value);
    }
  }, [value]);

  useEffect(() => {
    // Calculate total episodes and runtime
    let episodeCount = 0;
    let totalRuntime = 0;
    
    seasons.forEach(season => {
      if (Array.isArray(season.episodes)) {
        episodeCount += season.episodes.length;
        season.episodes.forEach(episode => {
          totalRuntime += Number(episode.runtime) || 0;
        });
      }
    });
    
    setStats({ totalEpisodes: episodeCount, totalRuntime });
  }, [seasons]);

  const updateParent = (newSeasons) => {
    setSeasons(newSeasons);
    if (onChange) {
      onChange(newSeasons);
    }
  };
  
  // Season management functions
  const handleAddSeason = () => {
    const newSeasons = [...seasons];
    const newSeasonNumber = seasons.length > 0 ? 
      Math.max(...seasons.map(s => s.season_number || 0)) + 1 : 1;
    
    newSeasons.push({
      id: Date.now(),
      season_number: newSeasonNumber,
      name: `Season ${newSeasonNumber}`,
      episode_count: 0,
      air_date: dayjs().format('YYYY-MM-DD'),
      overview: '',
      poster_path: '',
      vote_average: 0,
      episodes: []
    });
    
    const newKey = Date.now();
    setExpandedKeys([...expandedKeys, newKey]);
    setActiveTab({...activeTab, [newKey]: 'details'});
    updateParent(newSeasons);
  };
  
  const handleRemoveSeason = (seasonIndex) => {
    const newSeasons = [...seasons];
    newSeasons.splice(seasonIndex, 1);
    updateParent(newSeasons);
  };
  
  const updateSeason = (index, field, value) => {
    const newSeasons = [...seasons];
    newSeasons[index] = {
      ...newSeasons[index],
      [field]: value
    };
    updateParent(newSeasons);
  };
  
  // Episode management functions
  const addEpisode = (seasonIndex) => {
    const newSeasons = [...seasons];
    const season = newSeasons[seasonIndex];
    const newEpisodeNumber = season.episodes?.length > 0 ? 
      Math.max(...season.episodes.map(e => e.episode_number || 0)) + 1 : 1;
    
    if (!Array.isArray(season.episodes)) {
      season.episodes = [];
    }
    
    season.episodes.push({
      id: Date.now(),
      episode_number: newEpisodeNumber,
      name: `Episode ${newEpisodeNumber}`,
      title: `Episode ${newEpisodeNumber}`, // For compatibility with ShowModal
      air_date: dayjs().format('YYYY-MM-DD'),
      overview: '',
      runtime: 0,
      still_path: '',
      vote_average: 0,
      season_number: season.season_number,
      episode_type: 'standard',
      has_subtitles: false,
      production_code: ''
    });
    
    season.episode_count = season.episodes.length;
    updateParent(newSeasons);
  };
  
  const removeEpisode = (seasonIndex, episodeIndex) => {
    const newSeasons = [...seasons];
    newSeasons[seasonIndex].episodes.splice(episodeIndex, 1);
    
    // Renumber episodes
    newSeasons[seasonIndex].episodes.forEach((episode, idx) => {
      episode.episode_number = idx + 1;
    });
    
    newSeasons[seasonIndex].episode_count = newSeasons[seasonIndex].episodes.length;
    updateParent(newSeasons);
  };
  
  const moveEpisode = (seasonIndex, episodeIndex, direction) => {
    const newSeasons = [...seasons];
    const episodes = newSeasons[seasonIndex].episodes;
    
    if (direction === 'up' && episodeIndex > 0) {
      [episodes[episodeIndex], episodes[episodeIndex-1]] = 
        [episodes[episodeIndex-1], episodes[episodeIndex]];
    } else if (direction === 'down' && episodeIndex < episodes.length - 1) {
      [episodes[episodeIndex], episodes[episodeIndex+1]] = 
        [episodes[episodeIndex+1], episodes[episodeIndex]];
    }
    
    // Renumber episodes
    episodes.forEach((episode, idx) => {
      episode.episode_number = idx + 1;
    });
    
    updateParent(newSeasons);
  };
  
  const updateEpisode = (seasonIndex, episodeIndex, field, value) => {
    const newSeasons = [...seasons];
    
    // Keep name and title in sync (for compatibility)
    if (field === 'name' || field === 'title') {
      newSeasons[seasonIndex].episodes[episodeIndex].name = value;
      newSeasons[seasonIndex].episodes[episodeIndex].title = value;
    } else {
      newSeasons[seasonIndex].episodes[episodeIndex][field] = value;
    }
    
    updateParent(newSeasons);
  };

  // Table columns for episodes list
  const episodeColumns = (seasonIndex) => [
    {
      title: (
        <Tooltip title="Episode number in the season">
          #
        </Tooltip>
      ),
      dataIndex: 'episode_number',
      key: 'episode_number',
      width: 60,
      render: (text, record, index) => (
        <InputNumber
          min={1}
          value={text}
          onChange={(value) => updateEpisode(seasonIndex, index, 'episode_number', value)}
          style={{ width: 60 }}
        />
      )
    },
    {
      title: (
        <Tooltip title="Type of episode (standard, premiere, finale, etc.)">
          Type
        </Tooltip>
      ),
      dataIndex: 'episode_type',
      key: 'episode_type',
      width: 120,
      render: (text, record, index) => (
        <Select
          value={text || 'standard'}
          onChange={(value) => updateEpisode(seasonIndex, index, 'episode_type', value)}
          style={{ width: '100%' }}
        >
          <Option value="standard">Standard</Option>
          <Option value="premiere">Premiere</Option>
          <Option value="finale">Finale</Option>
          <Option value="mid-season finale">Mid-Season Finale</Option>
          <Option value="special">Special</Option>
        </Select>
      )
    },
    {
      title: (
        <Tooltip title="Episode runtime in minutes">
          Runtime
        </Tooltip>
      ),
      dataIndex: 'runtime',
      key: 'runtime',
      width: 120, // Increased width to fit the suffix
      render: (text, record, index) => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <InputNumber
            value={text}
            onChange={(value) => updateEpisode(seasonIndex, index, 'runtime', value)}
            style={{ width: 70 }}
            min={0}
          />
          <span style={{ marginLeft: 5, color: '#8c8c8c' }}>min</span>
        </div>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record, index) => (
        <Space>
          <Tooltip title="Move Up">
            <Button
              size="small"
              type="text"
              icon={<ArrowUpOutlined />}
              onClick={() => moveEpisode(seasonIndex, index, 'up')}
              disabled={index === 0}
            />
          </Tooltip>
          <Tooltip title="Move Down">
            <Button
              size="small"
              type="text"
              icon={<ArrowDownOutlined />}
              onClick={() => moveEpisode(seasonIndex, index, 'down')}
              disabled={index === seasons[seasonIndex].episodes.length - 1}
            />
          </Tooltip>
          <Tooltip title="Duplicate Episode">
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                const newSeasons = [...seasons];
                const episodeToDuplicate = {...newSeasons[seasonIndex].episodes[index]};
                
                // Create new episode with unique ID and incremented number
                const newEpisode = {
                  ...episodeToDuplicate,
                  id: Date.now(),
                  name: `${episodeToDuplicate.name} (Copy)`,
                  title: `${episodeToDuplicate.title} (Copy)`
                };
                
                // Add to end of episodes array
                newSeasons[seasonIndex].episodes.push(newEpisode);
                updateParent(newSeasons);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this episode?"
            description={`This will remove Episode ${record.episode_number} - ${record.name || 'Unnamed'}`}
            onConfirm={() => removeEpisode(seasonIndex, index)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            overlayClassName="custom-dark-popconfirm" // Add this line
          >
            <Tooltip title="Delete Episode">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent row expansion when clicking delete
                }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    },
  ];

  // Detailed episode editor component
  const EpisodeDetails = ({ episode, seasonIndex, episodeIndex }) => (
    <Form layout="vertical">
      {/* Add prominent episode title at the top */}
      <div className="episode-title-section">
        <Form.Item 
          label={
            <span className="episode-title-label">
              Episode Title
              <Tooltip title="The title that will be displayed for this episode">
                <span className="help-tip">(?)</span>
              </Tooltip>
            </span>
          } 
          style={{ marginBottom: 0 }}
        >
          <Input
            value={episode.name}
            onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'name', e.target.value)}
            placeholder="Enter episode title"
            size="large"
            style={{ fontSize: 16 }}
          />
        </Form.Item>
      </div>

      <Form.Item 
        label={
          <span>
            Overview
            <Tooltip title="Brief summary of what happens in this episode">
              <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
            </Tooltip>
          </span>
        }
      >
        <TextArea
          value={episode.overview}
          onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'overview', e.target.value)}
          autoSize={{ minRows: 3, maxRows: 6 }}
          placeholder="Episode description"
        />
      </Form.Item>
      
      {/* Rest of the form remains the same */}
      <div style={{ display: 'flex', gap: 16 }}>
        <Form.Item 
          label={
            <span>
              Air Date
              <Tooltip title="Original broadcast date of this episode">
                <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
              </Tooltip>
            </span>
          } 
          style={{ flex: 1 }}
        >
          <DatePicker
            value={episode.air_date ? dayjs(episode.air_date) : null}
            onChange={(date) => updateEpisode(seasonIndex, episodeIndex, 'air_date', date ? date.format('YYYY-MM-DD') : null)}
            style={{ width: '100%' }}
          />
        </Form.Item>
        
        <Form.Item 
          label={
            <span>
              Still Path
              <Tooltip title="Path to the thumbnail image for this episode">
                <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
              </Tooltip>
            </span>
          }  
          style={{ flex: 2 }}
        >
          <Input
            value={episode.still_path}
            onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'still_path', e.target.value)}
            placeholder="/path/to/still.jpg"
          />
        </Form.Item>
      </div>
      
      <div style={{ display: 'flex', gap: 16 }}>
        <Form.Item 
          label={
            <span>
              Production Code
              <Tooltip title="Studio's internal reference number for the episode">
                <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
              </Tooltip>
            </span>
          } 
          style={{ flex: 1 }}
        >
          <Input
            value={episode.production_code}
            onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'production_code', e.target.value)}
            placeholder="Production code"
          />
        </Form.Item>
        
        <Form.Item 
          label={
            <span>
              Vote Average
              <Tooltip title="Average rating from 0-10">
                <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
              </Tooltip>
            </span>
          } 
          style={{ flex: 1 }}
        >
          <InputNumber
            value={episode.vote_average}
            onChange={(value) => updateEpisode(seasonIndex, episodeIndex, 'vote_average', value)}
            min={0}
            max={10}
            step={0.1}
            style={{ width: '100%' }}
          />
        </Form.Item>
        
        <Form.Item 
          label={
            <span>
              Has Subtitles
              <Tooltip title="Whether this episode has subtitles available">
                <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
              </Tooltip>
            </span>
          } 
          style={{ flex: 1 }}
        >
          <Select
            value={episode.has_subtitles === true}
            onChange={(value) => updateEpisode(seasonIndex, episodeIndex, 'has_subtitles', value)}
            style={{ width: '100%' }}
          >
            <Option value={false}>No</Option>
            <Option value={true}>Yes</Option>
          </Select>
        </Form.Item>
      </div>
    </Form>
  );
  
  return (
    <div className="seasons-episodes-editor">
      {/* Stats display */}
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Tooltip title="Total number of seasons in this TV show">
          <Tag color="blue">{seasons.length} Seasons</Tag>
        </Tooltip>
        <Tooltip title="Total number of episodes across all seasons">
          <Tag color="green">{stats.totalEpisodes} Episodes</Tag>
        </Tooltip>
        <Tooltip title="Total runtime of all episodes combined">
          <Tag color="purple">
            {stats.totalRuntime} {stats.totalRuntime === 1 ? 'Minute' : 'Minutes'} ({Math.floor(stats.totalRuntime/60)}h {stats.totalRuntime % 60}m)
          </Tag>
        </Tooltip>
      </div>
      
      <Collapse
        bordered={false}
        expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
        className="seasons-collapse"
        onChange={setExpandedKeys}
        activeKey={expandedKeys}
      >
        {seasons.map((season, index) => (
          <Panel
            header={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Space>
                  <span>Season {season.season_number}</span>
                  <span style={{ color: '#888' }}>{season.name}</span>
                  <span style={{ color: '#888' }}>({(season.episodes && season.episodes.length) || 0} episodes)</span>
                  {season.air_date && (
                    <span style={{ color: '#888' }}>
                      ({dayjs(season.air_date).format('YYYY')})
                    </span>
                  )}
                </Space>
                <Space>
                  {season.episodes?.length > 0 && (
                    <Tag color="#8c8c8c">
                      {season.episodes.reduce((sum, ep) => sum + (Number(ep.runtime) || 0), 0)} min
                    </Tag>
                  )}
                </Space>
              </div>
            }
            key={season.id || index}
            extra={
              <Popconfirm
                title="Delete this season?"
                description={`This will remove Season ${season.season_number} and all its episodes.`}
                onConfirm={(e) => {
                  e.stopPropagation();
                  handleRemoveSeason(index);
                }}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </Popconfirm>
            }
          >
            <Tabs 
              activeKey={activeTab[season.id || index] || 'details'}
              onChange={(key) => setActiveTab({...activeTab, [season.id || index]: key})}
            >
              <TabPane 
                tab={
                  <Tooltip title="Edit general season information">
                    <span>Season Details</span>
                  </Tooltip>
                } 
                key="details"
              >
                <Form layout="vertical">
                  <Form.Item 
                    label={
                      <span>
                        Season Name
                        <Tooltip title="Display name for this season">
                          <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
                        </Tooltip>
                      </span>
                    }
                  >
                    <Input
                      value={season.name}
                      onChange={(e) => updateSeason(index, 'name', e.target.value)}
                    />
                  </Form.Item>
                  <Form.Item 
                    label={
                      <span>
                        Air Date
                        <Tooltip title="Release date of the first episode of this season">
                          <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
                        </Tooltip>
                      </span>
                    }
                  >
                    <DatePicker
                      value={season.air_date ? dayjs(season.air_date) : null}
                      onChange={(date) => updateSeason(index, 'air_date', date ? date.format('YYYY-MM-DD') : null)}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <Form.Item 
                    label={
                      <span>
                        Overview
                        <Tooltip title="Brief description of this season">
                          <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
                        </Tooltip>
                      </span>
                    }
                  >
                    <TextArea
                      value={season.overview}
                      onChange={(e) => updateSeason(index, 'overview', e.target.value)}
                      autoSize={{ minRows: 3, maxRows: 6 }}
                    />
                  </Form.Item>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <Form.Item 
                      label={
                        <span>
                          Poster Path
                          <Tooltip title="Path to the poster image for this season">
                            <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
                          </Tooltip>
                        </span>
                      } 
                      style={{ flex: 2 }}
                    >
                      <Input
                        value={season.poster_path}
                        onChange={(e) => updateSeason(index, 'poster_path', e.target.value)}
                        placeholder="/path/to/poster.jpg"
                      />
                    </Form.Item>
                    <Form.Item 
                      label={
                        <span>
                          Vote Average
                          <Tooltip title="Average rating for this season from 0-10">
                            <span style={{ marginLeft: 8, cursor: 'help', color: '#8c8c8c' }}>(?)</span>
                          </Tooltip>
                        </span>
                      } 
                      style={{ flex: 1 }}
                    >
                      <InputNumber
                        value={season.vote_average}
                        onChange={(value) => updateSeason(index, 'vote_average', value)}
                        min={0}
                        max={10}
                        step={0.1}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </div>
                </Form>
              </TabPane>
              
              <TabPane 
                tab={
                  <Tooltip title="Manage episodes in this season">
                    <span>Episodes</span>
                  </Tooltip>
                } 
                key="episodes"
              >
                <div style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => addEpisode(index)}
                  >
                    Add Episode
                  </Button>
                </div>
                <Table
                  columns={episodeColumns(index)}
                  dataSource={season.episodes}
                  rowKey={(record) => record.id || record.episode_number}
                  pagination={false}
                  size="small"
                  expandable={{
                    expandedRowRender: (record, i) => (
                      <EpisodeDetails 
                        episode={record} 
                        seasonIndex={index} 
                        episodeIndex={i} 
                      />
                    ),
                    expandRowByClick: true,
                    // Add custom expand icon with tooltip
                    expandIcon: ({ expanded, onExpand, record }) => (
                      <Tooltip 
                        title={expanded ? "Hide episode details" : "Show episode details"} 
                        placement="right"
                      >
                        <Button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onExpand(record, e);
                          }}
                          type="text"
                          size="small"
                          icon={expanded ? (
                            <CaretRightOutlined rotate={90} />
                          ) : (
                            <CaretRightOutlined />
                          )}
                        />
                      </Tooltip>
                    )
                  }}
                  locale={{
                    emptyText: (
                      <Empty 
                        image={Empty.PRESENTED_IMAGE_SIMPLE} 
                        description={
                          <span>
                            No episodes in this season yet
                            <br />
                            <Button 
                              type="link" 
                              onClick={() => addEpisode(index)}
                              style={{ padding: 0, height: 'auto', marginTop: 8 }}
                            >
                              Add your first episode
                            </Button>
                          </span>
                        }
                      />
                    )
                  }}
                />
              </TabPane>
            </Tabs>
          </Panel>
        ))}
      </Collapse>
      
      <Button
        type="primary"
        onClick={handleAddSeason}
        style={{ 
          marginTop: 16, 
          width: '100%', 
          height: '40px',
          background: '#e50914', // Netflix-style red
          borderColor: '#e50914'
        }}
        icon={<PlusOutlined />}
      >
        Add Season
      </Button>
    </div>
  );
};

export default SeasonEpisodeEditor;