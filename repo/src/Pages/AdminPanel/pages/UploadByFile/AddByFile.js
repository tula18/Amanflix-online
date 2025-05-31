import React, { useState } from 'react';
import { Steps, Button, message } from 'antd';
import { FileTextOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';
import FileDropper from './components/FileDropper';
import ReviewCards from './components/ReviewCards';
import PrefilledUpload from './components/PrefilledUpload';
import './AddByFile.css';

const { Step } = Steps;

const AddByFile = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [parsedData, setParsedData] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const steps = [
        {
            title: 'Select Files',
            description: 'Drop or select video files',
            icon: <FileTextOutlined />,
        },
        {
            title: 'Review & Edit',
            description: 'Verify detected metadata',
            icon: <EyeOutlined />,
        },
        {
            title: 'Upload',
            description: 'Complete the upload process',
            icon: <UploadOutlined />,
        },
    ];

    const handleFilesSelected = (files) => {
        setSelectedFiles(files);
    };

    const handleParseComplete = (data) => {
        setParsedData(data);
        setCurrentStep(1);
    };

    const handleReviewComplete = (editedData) => {
        setParsedData(editedData);
        setCurrentStep(2);
    };

    const handleDataUpdate = (updatedData) => {
        setParsedData(updatedData);
    };

    const handleUploadComplete = () => {
        message.success('Upload completed successfully!');
        // Reset the component
        setCurrentStep(0);
        setParsedData(null);
        setSelectedFiles([]);
    };

    const handleBackToStep = (step) => {
        setCurrentStep(step);
    };

    const renderCurrentStep = () => {
        switch (currentStep) {
            case 0:
                return (
                    <FileDropper
                        onFilesSelected={handleFilesSelected}
                        onParseComplete={handleParseComplete}
                        selectedFiles={selectedFiles}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                    />
                );
            case 1:
                return (
                    <ReviewCards
                        parsedData={parsedData}
                        onReviewComplete={handleReviewComplete}
                        onBack={() => handleBackToStep(0)}
                    />
                );
            case 2:
                return (
                    <PrefilledUpload
                        parsedData={parsedData}
                        selectedFiles={selectedFiles}
                        onUploadComplete={handleUploadComplete}
                        onDataUpdate={handleDataUpdate}
                        onBack={() => handleBackToStep(1)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="add-by-file-container">
            <div className="add-by-file-header">
                <h1>Add Content By File</h1>
                <p>Upload video files with automatic metadata detection using GuessIt</p>
            </div>

            <div className="steps-container">
                <Steps current={currentStep} size="default">
                    {steps.map((step, index) => (
                        <Step
                            key={index}
                            title={step.title}
                            description={step.description}
                            icon={step.icon}
                        />
                    ))}
                </Steps>
            </div>

            <div className="step-content">
                {renderCurrentStep()}
            </div>
        </div>
    );
};

export default AddByFile;
