import styled, { css, keyframes } from 'styled-components';

const toUpOpacity = keyframes`
  0% {
    opacity: 0;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-20px);
  }

  100% {
    opacity: 0;
    transform: translateY(0);
  }
`;

export interface IContainerProps {
  fullPlayer: boolean;
  hideVideo: boolean;
  fontFamily: string;
}

export const Container = styled.div<IContainerProps>`
  text-align: left;

  & > * {
    outline: 0;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: ${props =>
      props.fontFamily
        ? props.fontFamily
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"};
  }

  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  overflow: hidden;

  video {
    height: 100% !important;
    max-height: 100% !important;
    width: 100% !important;
    max-width: 100% !important;
    cursor: none;
    opacity: ${props => (props.hideVideo ? 0 : 1)};

    &::cue {
      color: #eee;
      z-index: 4;
      text-shadow: #222 0 0 5px;
      background: none;
      font-family: ${props =>
        props.fontFamily
          ? props.fontFamily
          : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"};
    }
  }

  ${props =>
    props.fullPlayer &&
    css`
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10000;
    `}
`;

export interface IControlsProps {
  show: boolean;
  primaryColor: string;
  progressVideo: number;
}

export const Controls = styled.div<IControlsProps>`
  opacity: ${props => (props.show ? 1 : 0)};
  transform: ${props => (props.show ? 'scale(1)' : 'scale(1.2)')};

  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  transition: all 0.2s ease-out;

  padding: 10px;
  color: #fff;
  font-size: 1.5em;
  background: rgb(0, 0, 0);
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 1) 0%,
    rgba(0, 0, 0, 0.7) 20%,
    rgba(0, 0, 0, 0) 40%,
    rgba(0, 0, 0, 0) 60%,
    rgba(0, 0, 0, 0.7) 80%,
    rgba(0, 0, 0, 1) 100%
  );

  .back {
    margin-bottom: auto;
    margin-top: 30px;
    margin-left: 50px;
    display: flex;

    div {
      display: flex;
      font-size: 20px;
      align-items: center;
      opacity: 0.3;
      transition: all 0.2s ease-out;
      overflow: hidden;

      span {
        margin-left: -100%;
        opacity: 0;
        transition: all ease-out 0.2s;
      }

      &:hover {
        opacity: 1;
        transform: translateX(-10px);

        span {
          margin-left: 0;
          opacity: 1;
        }
      }

      svg {
        font-size: 35px;
        margin-right: 5px;
      }
    }
  }

  .line-reproduction {
    display: flex;
    margin-bottom: 10px;

    input {
      margin: auto;
    }

    span {
      font-size: 14px;
      margin-left: 5px;
    }
  }

  .controls {
    margin: 20px 0;
    display: flex;
    justify-items: center;

    .end {
      margin-left: auto;
    }

    div {
      display: flex;
      justify-items: center;
    }

    .item-control {
      position: relative;
      margin: auto 15px;
    }

    .info-video {
      font-size: 16px;
      margin-top: -1px;

      .info-first {
        font-weight: bold;
        opacity: 1;
        margin-right: 5px;
      }

      .info-second {
        font-weight: lighter;
        opacity: 0.5;
      }
    }

    svg {
      cursor: pointer;
      opacity: 0.2;
      font-size: 25px;
      transition: all 0.2s ease-out;

      &:hover {
        opacity: 1;
        transform: scale(1.2);
      }
    }
  }

  .progress-bar {
    width: 100%;
    margin-bottom: 15px;
    appearance: none;
    height: 3px;
    transition: height 0.2s ease-out;
    border-radius: 5px;
    background: linear-gradient(
      93deg,
      ${props => props.primaryColor} ${props => props.progressVideo}%,
      #fff ${props => props.progressVideo}%
    );
    -webkit-appearance: none;
    -moz-appearance: none;

    &:focus {
      outline: none !important;
    }

    &::-moz-focus-outer {
      border: 0;
    }

    &::-ms-track {
      background: transparent;
      border-color: transparent;
      color: transparent;
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      border: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${props => props.primaryColor};
      cursor: pointer;

      outline: none !important;
      border-color: transparent;
      border: 0 !important;
      box-shadow: none !important;
      box-sizing: none;
    }

    &::-moz-range-thumb {
      -webkit-appearance: none;
      border: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${props => props.primaryColor};
      cursor: pointer;

      outline: none !important;
      border-color: transparent;
      border: 0 !important;
      box-shadow: none !important;
      box-sizing: none;
    }

    &:hover {
      height: 5px;
    }
  }
`;

export const ProgressBarContainer = styled.div<{ primaryColor: string; bufferedProgress: number; progressVideo: number }>`
  position: relative;
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: visible; /* Change from hidden to visible to show the thumb */

  .buffered-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: rgba(255, 255, 255, 0.5);
    width: ${props => props.bufferedProgress}%;
    transition: width 0.1s ease;
    border-radius: 3px;
  }

  .played-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: ${props => props.primaryColor};
    width: ${props => props.progressVideo}%;
    transition: width 0.1s ease;
    z-index: 1;
    border-radius: 3px;
  }

  .progress-bar {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    z-index: 3; /* Increase z-index to ensure thumb is on top */

    &:focus {
      outline: none !important;
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${props => props.primaryColor};
      cursor: pointer;
      border: 2px solid #fff; /* Add white border for better visibility */
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      position: relative;
      z-index: 4;
    }

    &::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${props => props.primaryColor};
      cursor: pointer;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      position: relative;
      z-index: 4;
    }

    &::-ms-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${props => props.primaryColor};
      cursor: pointer;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    &:hover {
      height: 7px;
      top: -1px;
      
      &::-webkit-slider-thumb {
        width: 20px;
        height: 20px;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
      }

      &::-moz-range-thumb {
        width: 20px;
        height: 20px;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
      }

      &::-ms-thumb {
        width: 20px;
        height: 20px;
      }
    }
  }

  &:hover {
    height: 7px;
    
    .buffered-bar,
    .played-bar {
      height: 7px;
    }
  }
`;

export interface IVideoPreLoadingProps {
  show: boolean;
  colorTitle: string;
  colorSubTitle: string;
  colorIcon: string;
  showError: boolean;
  colorButtonError: string;
  backgroundColorButtonError: string;
  backgroundColorHoverButtonError: string;
  colorHoverButtonError: string;
}

export const VideoPreLoading = styled.div<IVideoPreLoadingProps>`
  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  padding: 30px;
  transition: all 0.5s ease-out;
  z-index: ${props => (props.show ? 2 : 0)};
  display: flex;
  flex-direction: column;
  opacity: ${props => (props.show ? 1 : 0)};

  header {
    display: flex;
    color: #ffffff;
    align-items: center;

    h1 {
      color: ${props => props.colorTitle};
      font-size: 1.5em;
      font-weight: bold;
    }

    h2 {
      color: ${props => props.colorSubTitle};
      font-size: 1.1em;
    }

    svg {
      color: ${props => props.colorIcon};
      opacity: 0.5;
      margin-left: auto;
      font-size: 4em;
      padding: 10px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        transform: scale(1.2);
        opacity: 1;
      }
    }
  }

  section {
    text-align: center;
    color: #ddd;
    margin: auto;
    transition: all 0.2s ease;
    opacity: ${props => (props.showError ? 1 : 0)};

    .links-error {
      display: inline-flex;
      margin: auto;

      div {
        color: ${props => props.colorButtonError};
        background: ${props => props.backgroundColorButtonError};
        display: flex;
        align-items: center;
        margin: 0 5px;
        padding: 10px;
        font-weight: bold;
        cursor: pointer;
        border-radius: 5px;
        transition: all 0.2s ease;

        &:hover {
          background: ${props => props.backgroundColorHoverButtonError};
          color: ${props => props.colorHoverButtonError};
        }
      }
    }

    h1 {
      font-size: 2em;
    }

    p {
      font-size: 1.5em;
      margin: 20px;
    }
  }
`;

export interface IStandByInfoProps {
  show: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export const StandByInfo = styled.div<IStandByInfoProps>`
  position: absolute;
  top: 0;
  background: rgba(0, 0, 0, 0.8);
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 50px;
  transition: all 0.5s ease-out;
  opacity: ${props => (props.show ? 1 : 0)};

  section {
    margin: auto 0;
    padding-top: 100px;
    padding-left: 100px;

    h3 {
      color: #fff;
      font-size: 1.1em;
      margin-bottom: 5px;
    }

    h1 {
      font-weight: bold;
      font-size: 3em;
      color: ${props => props.primaryColor};
      margin: 10px 0;
    }

    h2 {
      color: ${props => props.secondaryColor};
      font-size: 20px;
      margin-top: -5px;
      font-weight: bold;
    }
  }

  footer {
    margin-top: auto;
    margin-bottom: 50px;
    margin-left: auto;
    text-transform: uppercase;
    color: #ffffff;
  }
`;

export const Loading = styled.div`
  position: absolute;
  height: 100% !important;
  width: 100% !important;
  display: flex;

  div {
    display: flex;
    margin: auto;

    div {
      &:nth-child(2) {
        animation-delay: 0.1s;
      }

      &:nth-child(3) {
        animation-delay: 0.2s;
      }

      animation: 1s linear ${toUpOpacity} infinite;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: ${props => props.color};
      margin: auto 5px;
    }
  }
`;

export interface IVolumeControlProps {
  primaryColor: string;
  percentVolume: number;
}

export const VolumeControl = styled.div<IVolumeControlProps>`
  .volume-control {
    bottom: 70px;
    left: -50px;
    position: absolute;
    transform: rotate(-90deg);

    .box {
      background: #222222;
      padding: 10px 18px;
      border-radius: 5px;
    }

    .box-connector {
      width: 20px;
    }

    input {
      border: none;
      appearance: none;
      height: 5px;
      border-radius: 5px;
      background: #999;
      background: linear-gradient(
        93deg,
        ${props => props.primaryColor} ${props => props.percentVolume}%,
        #fff ${props => props.percentVolume}%
      );
      width: 70px;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        border: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${props => props.primaryColor};
        cursor: pointer;
      }

      &::-moz-range-thumb {
        -webkit-appearance: none;
        border: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${props => props.primaryColor};
        cursor: pointer;
      }
    }
  }
`;

const ItemControlBar = styled.div`
  bottom: 20px;
  right: -20px;
  position: absolute;
  display: flex;
  flex-direction: column;
  width: 300px;

  .box-connector {
    height: 20px;
    width: 100%;
  }
`;

export const IconPlayBackRate = styled.div`
  cursor: pointer;
  font-weight: bold;

  small {
    font-weight: lighter;
    font-weight: 10px;
  }

  span {
    opacity: 0.2;
    font-size: 25px;
    transition: all 0.2s ease-out;

    &:hover {
      opacity: 1;
      transform: scale(1.2);
    }
  }
`;

export const ItemPlaybackRate = styled(ItemControlBar)`
  cursor: pointer;
  font-weight: bold;
  max-width: 150px;

  & > div:first-child {
    background: #333;
    display: flex;
    flex-direction: column;
    border-radius: 5px;

    .title {
      font-size: 18px;
      font-weight: bold;
      padding: 10px;
      margin: 0;
    }

    .item {
      background: #222;
      display: flex;
      font-size: 14px;
      padding: 10px;
      cursor: pointer;
      transition: all 0.2s ease-out;
      flex-direction: row;
      align-items: center;

      &:hover {
        background: #333;
      }
    }

    svg {
      font-size: 14px !important;
      margin-right: 5px;
    }

    .bold {
      font-weight: bold;
    }
  }
`;

export const ItemNext = styled(ItemControlBar)`
  & > div:first-child {
    background: #333;
    display: flex;
    flex-direction: column;
    border-radius: 5px;

    .title {
      font-size: 18px;
      font-weight: bold;
      padding: 10px;
      margin: 0;
    }

    .item {
      background: #222;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      padding: 10px;
      cursor: pointer;
      transition: all 0.2s ease-out;

      &:hover {
        background: #333;
      }
    }
    .bold {
      font-weight: bold;
    }
  }
`;

export const ItemPlaylist = styled(ItemControlBar)`
  max-width: 400px;
  overflow: hidden;

  & > div:first-child {
    background: #333;
    display: flex;
    flex-direction: column;
    border-radius: 5px;
    overflow: hidden;

    .bold {
      font-weight: bold;
    }

    .title {
      font-size: 18px;
      font-weight: bold;
      padding: 10px;
      margin: 0;
    }

    .list-playback {
      display: flex;
      flex-direction: column;
      max-height: 400px;
      overflow: auto;

      &::-webkit-scrollbar-track {
        background-color: #222;
      }

      &::-webkit-scrollbar {
        width: 8px;
      }

      &::-webkit-scrollbar-thumb {
        background: #333;
      }

      .item-playback {
        background: #222;
        display: flex;
        flex-direction: row;
        font-size: 14px;
        padding: 10px;
        cursor: pointer;
        transition: all 0.2s ease-out;
        align-items: center;

        &:hover {
          background: #333;
        }

        .percent {
          height: 3px;
          width: 100px;
          margin-left: auto;
        }
      }

      .selected {
        background: #333;
      }
    }
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const PreviewImage = styled.div`
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.8);
  pointer-events: none;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #333;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);

  img {
    width: 160px;
    height: 90px;
    border-radius: 2px;
    border: 1px solid #555;
    object-fit: cover;
  }

  .sprite-thumbnail {
    border-radius: 2px;
    border: 1px solid #555;
  }

  .time-indicator {
    color: white;
    font-size: 12px;
    text-align: center;
    margin-top: 4px;
    padding: 2px 4px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 2px;
    font-weight: 500;
  }

  .loading-fallback {
    width: 160px;
    height: 90px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    border: 1px solid #555;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;

    .loading-spinner {
      display: flex;
      gap: 3px;
      margin-bottom: 6px;

      div {
        width: 4px;
        height: 4px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        animation: loading-bounce 1.4s ease-in-out infinite both;

        &:nth-child(1) {
          animation-delay: -0.32s;
        }

        &:nth-child(2) {
          animation-delay: -0.16s;
        }

        &:nth-child(3) {
          animation-delay: 0s;
        }
      }
    }

    span {
      opacity: 0.7;
      font-size: 10px;
    }
  }

  @keyframes loading-bounce {
    0%, 80%, 100% {
      transform: scale(0);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
`;

export const ItemListQuality = styled(ItemControlBar)`
  max-width: 200px;
  min-width: 200px;

  & > div:first-child {
    font-size: 14px;
    background: #222222;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    div {
      display: flex;
      align-items: center;
      padding: 10px;
      cursor: pointer;

      &:hover {
        background: #333;
      }
    }

    span {
      margin-right: 5px;

      &:nth-child(1) {
        font-weight: bold;
      }
    }

    svg {
      color: #f78b28;
      font-size: 2em;
      margin-left: auto;
    }
  }
`;
