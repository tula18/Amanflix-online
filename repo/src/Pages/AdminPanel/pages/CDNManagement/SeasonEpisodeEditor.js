// SeasonEpisodeEditor.js
import React, { useState } from 'react';
import { Collapse, Button, Table, Form, Input, InputNumber, DatePicker, Space, Tabs } from 'antd';
import { DeleteOutlined, PlusOutlined, CaretRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import TextArea from "antd/es/input/TextArea"; // Add this import

const { Panel } = Collapse;
const { TabPane } = Tabs;

const SeasonEpisodeEditor = ({ value, onChange }) => {
  // Default to empty array if value is not provided
  const seasons = Array.isArray(value) ? value : [];
  
  // Handle adding a new season
  const handleAddSeason = () => {
    const newSeasons = [...seasons];
    const newSeasonNumber = seasons.length > 0 ? Math.max(...seasons.map(s => s.season_number)) + 1 : 1;
    
    newSeasons.push({
      id: Date.now(), // Temporary ID for new season
      season_number: newSeasonNumber,
      name: `Season ${newSeasonNumber}`,
      episode_count: 0,
      air_date: dayjs().format('YYYY-MM-DD'),
      overview: '',
      poster_path: '',
      vote_average: 0,
      episodes: []
    });
    
    onChange(newSeasons);
  };
  
  // Handle removing a season
  const handleRemoveSeason = (seasonIndex) => {
    const newSeasons = [...seasons];
    newSeasons.splice(seasonIndex, 1);
    onChange(newSeasons);
  };
  
  // Update season details
  const updateSeason = (index, field, value) => {
    const newSeasons = [...seasons];
    newSeasons[index] = {
      ...newSeasons[index],
      [field]: value
    };
    onChange(newSeasons);
  };
  
  // Add a new episode to a season
  const addEpisode = (seasonIndex) => {
    const newSeasons = [...seasons];
    const season = newSeasons[seasonIndex];
    const newEpisodeNumber = season.episodes.length > 0 ? 
      Math.max(...season.episodes.map(e => e.episode_number)) + 1 : 1;
    
    season.episodes.push({
      id: Date.now(),
      episode_number: newEpisodeNumber,
      name: `Episode ${newEpisodeNumber}`,
      air_date: dayjs().format('YYYY-MM-DD'),
      overview: '',
      runtime: 0,
      still_path: '',
      vote_average: 0,
      season_number: season.season_number,
      episode_type: 'standard'
    });
    
    season.episode_count = season.episodes.length;
    onChange(newSeasons);
  };
  
  // Remove an episode
  const removeEpisode = (seasonIndex, episodeIndex) => {
    const newSeasons = [...seasons];
    newSeasons[seasonIndex].episodes.splice(episodeIndex, 1);
    newSeasons[seasonIndex].episode_count = newSeasons[seasonIndex].episodes.length;
    onChange(newSeasons);
  };
  
  // Update episode details
  const updateEpisode = (seasonIndex, episodeIndex, field, value) => {
    const newSeasons = [...seasons];
    newSeasons[seasonIndex].episodes[episodeIndex] = {
      ...newSeasons[seasonIndex].episodes[episodeIndex],
      [field]: value
    };
    onChange(newSeasons);
  };
  
  const episodeColumns = (seasonIndex) => [
    {
      title: '#',
      dataIndex: 'episode_number',
      key: 'episode_number',
      width: 60,
      render: (text, record, index) => (
        <InputNumber
          value={text}
          onChange={(value) => updateEpisode(seasonIndex, index, 'episode_number', value)}
          style={{ width: 60 }}
        />
      )
    },
    {
      title: 'Title',
      dataIndex: 'name',
      key: 'name',
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => updateEpisode(seasonIndex, index, 'name', e.target.value)}
        />
      )
    },
    {
      title: 'Air Date',
      dataIndex: 'air_date',
      key: 'air_date',
      width: 150,
      render: (text, record, index) => (
        <DatePicker
          value={text ? dayjs(text) : null}
          onChange={(date) => updateEpisode(seasonIndex, index, 'air_date', date ? date.format('YYYY-MM-DD') : null)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Runtime',
      dataIndex: 'runtime',
      key: 'runtime',
      width: 100,
      render: (text, record, index) => (
        <InputNumber
          value={text}
          onChange={(value) => updateEpisode(seasonIndex, index, 'runtime', value)}
          style={{ width: 100 }}
          addonAfter="min"
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_, record, index) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeEpisode(seasonIndex, index)}
        />
      )
    }
  ];
  
  return (
    <div className="seasons-episodes-editor">
      <Collapse
        bordered={false}
        expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
        className="seasons-collapse"
      >
        {seasons.map((season, index) => (
          <Panel
            header={
              <Space>
                <span>Season {season.season_number}</span>
                <span style={{ color: '#888' }}>{season.name}</span>
                <span style={{ color: '#888' }}>({season.episodes.length} episodes)</span>
              </Space>
            }
            key={season.id || index}
            extra={
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveSeason(index);
                }}
              />
            }
          >
            <Tabs defaultActiveKey="details">
              <TabPane tab="Season Details" key="details">
                <Form layout="vertical">
                  <Form.Item label="Season Name">
                    <Input
                      value={season.name}
                      onChange={(e) => updateSeason(index, 'name', e.target.value)}
                    />
                  </Form.Item>
                  <Form.Item label="Air Date">
                    <DatePicker
                      value={season.air_date ? dayjs(season.air_date) : null}
                      onChange={(date) => updateSeason(index, 'air_date', date ? date.format('YYYY-MM-DD') : null)}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <Form.Item label="Overview">
                    <TextArea
                      value={season.overview}
                      onChange={(e) => updateSeason(index, 'overview', e.target.value)}
                      autoSize={{ minRows: 3, maxRows: 6 }}
                    />
                  </Form.Item>
                  <Form.Item label="Poster Path">
                    <Input
                      value={season.poster_path}
                      onChange={(e) => updateSeason(index, 'poster_path', e.target.value)}
                      placeholder="/path/to/poster.jpg"
                    />
                  </Form.Item>
                  <Form.Item label="Vote Average">
                    <InputNumber
                      value={season.vote_average}
                      onChange={(value) => updateSeason(index, 'vote_average', value)}
                      min={0}
                      max={10}
                      step={0.1}
                      style={{ width: 120 }}
                    />
                  </Form.Item>
                </Form>
              </TabPane>
              <TabPane tab="Episodes" key="episodes">
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
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ y: 300 }}
                />
              </TabPane>
            </Tabs>
          </Panel>
        ))}
      </Collapse>
      <Button
        type="dashed"
        onClick={handleAddSeason}
        style={{ marginTop: 16, width: '100%' }}
        icon={<PlusOutlined />}
      >
        Add Season
      </Button>
    </div>
  );
};

export default SeasonEpisodeEditor;