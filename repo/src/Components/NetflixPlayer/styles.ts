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

const fadeInOut = keyframes`
  0% { 
    opacity: 0; 
    transform: translateX(-50%) translateY(-10px); 
  }
  10%, 90% { 
    opacity: 1; 
    transform: translateX(-50%) translateY(0); 
  }
  100% { 
    opacity: 0; 
    transform: translateX(-50%) translateY(-10px); 
  }
`;

const slideInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

export interface IContainerProps {
  $fullPlayer: boolean;
  $hideVideo: boolean;
  $fontFamily: string;
}

export const Container = styled.div<IContainerProps>`
  text-align: left;

  & > * {
    outline: 0;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: ${props =>
      props.$fontFamily
        ? props.$fontFamily
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
    opacity: ${props => (props.$hideVideo ? 0 : 1)};

    &::cue {
      color: #eee;
      z-index: 4;
      text-shadow: #222 0 0 5px;
      background: none;
      font-family: ${props =>
        props.$fontFamily
          ? props.$fontFamily
          : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"};
    }
  }

  ${props =>
    props.$fullPlayer &&
    css`
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10000;
    `}
`;

export interface IControlsProps {
  $show: boolean;
  $primaryColor: string;
  $progressVideo: number;
}

export const Controls = styled.div.attrs<IControlsProps>(props => ({
  style: {
    '--primary-color': props.$primaryColor,
    '--progress-video': `${props.$progressVideo}%`,
  } as React.CSSProperties,
}))<IControlsProps>`
  opacity: ${props => (props.$show ? 1 : 0)};
  transform: ${props => (props.$show ? 'scale(1)' : 'scale(1.05)')};

  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  transition: opacity 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: opacity, transform;
  transform-origin: center;
  backface-visibility: hidden;
  pointer-events: ${props => (props.$show ? 'auto' : 'none')};

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
    display: flex;      div {
        display: flex;
        font-size: 20px;
        align-items: center;
        opacity: 0.3;
        transition: all 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        overflow: hidden;

        span {
          margin-left: -100%;
          opacity: 0;
          transition: all cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.1s;
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
    align-items: center;

    input {
      flex: 1;
      /* margin: 0 10px; */
    }

    span {
      font-size: 14px;
      margin: 0px 5px;
      min-width: 60px;
      text-align: center;
      flex-shrink: 0;
    }
  }

  .controls {
    margin: 20px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .start {
      display: flex;
      align-items: center;
    }

    .center {
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 1;
      
      .info-video {
        text-align: center;
      }
    }

    .end {
      display: flex;
      align-items: center;
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
      opacity: 0.7;
      font-size: 25px;
      transition: opacity 0.03s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.03s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      will-change: opacity, transform;
      transform: translateZ(0);

      &:hover {
        opacity: 1;
        transform: translateZ(0) scale(1.15);
      }
    }
  }

  .progress-bar {
    width: 100%;
    margin-bottom: 15px;
    appearance: none;
    height: 3px;
    transition: height 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    border-radius: 5px;
    background: linear-gradient(
    93deg,
      var(--primary-color) var(--progress-video),
      #fff var(--progress-video)
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
      background: var(--primary-color);
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
      background: var(--primary-color);
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

interface IProgressBarContainerProps {
  $primaryColor: string;
  $bufferedProgress: number;
  $progressVideo: number;
}

export const ProgressBarContainer = styled.div.attrs<IProgressBarContainerProps>(props => ({
  style: {
    '--buffered-progress': `${props.$bufferedProgress}%`,
    '--progress-video': `${props.$progressVideo}%`,
    '--primary-color': props.$primaryColor,
  } as React.CSSProperties,
}))<IProgressBarContainerProps>`
  position: relative;
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: visible;
  will-change: transform; /* Optimize for hover transformations */
  transform: translateZ(0); /* Force hardware acceleration */

  .buffered-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: rgba(255, 255, 255, 0.5);
    width: var(--buffered-progress);
    transition: width 0.2s ease;
    border-radius: 3px;
    will-change: width;
    transform: translateZ(0);
  }

  .played-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--primary-color);
    width: var(--progress-video);
    transition: width 0.1s ease;
    z-index: 1;
    border-radius: 3px;
    will-change: width;
    transform: translateZ(0);
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
    z-index: 3;
    will-change: transform;
    transform: translateZ(0);

    &:focus {
      outline: none !important;
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      position: relative;
      z-index: 4;
      will-change: transform, width, height;
      transform: translateZ(0);
      transition: transform 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    &::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      position: relative;
      z-index: 4;
      will-change: transform, width, height;
      transform: translateZ(0);
      transition: transform 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    &::-ms-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    &:hover {
      height: 7px;
      top: -1px;
      transition: height 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      
      &::-webkit-slider-thumb {
        width: 20px;
        height: 20px;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
        transform: translateZ(0) scale(1);
      }

      &::-moz-range-thumb {
        width: 20px;
        height: 20px;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
        transform: translateZ(0) scale(1);
      }

      &::-ms-thumb {
        width: 20px;
        height: 20px;
      }
    }
  }

  &:hover {
    height: 7px;
    transition: height 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    
    .buffered-bar,
    .played-bar {
      height: 7px;
      transition: height 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
  }
`;

export interface IVideoPreLoadingProps {
  $show: boolean;
  $colorTitle: string;
  $colorSubTitle: string;
  $colorIcon: string;
  $showError: boolean;
  $colorButtonError: string;
  $backgroundColorButtonError: string;
  $backgroundColorHoverButtonError: string;
  $colorHoverButtonError: string;
}

export const VideoPreLoading = styled.div<IVideoPreLoadingProps>`
  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  padding: 30px;
  transition: all 0.5s ease-out;
  z-index: ${props => (props.$show ? 2 : 0)};
  display: flex;
  flex-direction: column;
  opacity: ${props => (props.$show ? 1 : 0)};

  header {
    display: flex;
    color: #ffffff;
    align-items: center;

    h1 {
      color: ${props => props.$colorTitle};
      font-size: 1.5em;
      font-weight: bold;
    }

    h2 {
      color: ${props => props.$colorSubTitle};
      font-size: 1.1em;
    }

    svg {
      color: ${props => props.$colorIcon};
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
    opacity: ${props => (props.$showError ? 1 : 0)};

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
  $show: boolean;
  $primaryColor: string;
  $secondaryColor: string;
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
  opacity: ${props => (props.$show ? 1 : 0)};
  pointer-events: ${props => (props.$show ? 'auto' : 'none')}; /* Add this line */
  z-index: ${props => (props.$show ? 1000 : -1)}; /* Move z-index when hidden */

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
      color: ${props => props.$primaryColor};
      margin: 10px 0;
    }

    h2 {
      color: ${props => props.$secondaryColor};
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
  $primaryColor: string;
  $percentVolume: number;
}

export const VolumeControl = styled.div<IVolumeControlProps>`
  transition: all 0.03s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;

  .volume-control {
    bottom: 70px;
    left: -50px;
    position: absolute;
    transform: rotate(-90deg);
    transition: opacity 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    will-change: opacity, transform;

    .box {
      background: #222222;
      padding: 10px 18px;
      border-radius: 5px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
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
        ${props => props.$primaryColor} ${props => props.$percentVolume}%,
        #fff ${props => props.$percentVolume}%
      );
      width: 70px;
      transition: all 0.03s cubic-bezier(0.25, 0.46, 0.45, 0.94);

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        border: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${props => props.$primaryColor};
        cursor: pointer;
        transition: all 0.03s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      &::-moz-range-thumb {
        -webkit-appearance: none;
        border: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${props => props.$primaryColor};
        cursor: pointer;
        transition: all 0.03s cubic-bezier(0.25, 0.46, 0.45, 0.94);
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
    height: 15px; /* Reduce from 20px to 15px */
    width: 100%;
  }
`;

export interface IconPlayBackRateProps {
  $primaryColor: string;
}

export const IconPlayBackRate = styled.div<IconPlayBackRateProps>`
  cursor: pointer;
  font-weight: bold;
  position: relative;
  opacity: 0.7;
  font-size: 24px;
  transition: all 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  margin: -8px -12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(5px);
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.5px;

  small {
    font-weight: 300;
    font-size: 14px;
    opacity: 0.8;
  }

  .playbackRate_span {
    display: flex;
    align-items: center;
  }

  &:hover {
    opacity: 1;
    transform: scale(1.05);
    background: rgba(255, 255, 255, 0.1);
    border-color: ${props => props.$primaryColor || '#03dffc'};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    color: ${props => props.$primaryColor || '#03dffc'};
  }

  &:active {
    transform: scale(0.98);
  }
`;

export interface IconPlaylistProps {
  $primaryColor: string;
}

export const IconPlaylist = styled.div<IconPlaylistProps>`
  cursor: pointer;
  font-weight: bold;
  position: relative;
  opacity: 0.7;
  font-size: 24px;
  transition: all 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  margin: -8px -12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(5px);
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.5px;

  &:hover {
    opacity: 1;
    transform: scale(1.05);
    background: rgba(255, 255, 255, 0.1);
    border-color: ${props => props.$primaryColor || '#03dffc'};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    color: ${props => props.$primaryColor || '#03dffc'};
  }

  &:active {
    transform: scale(0.98);
  }
`;

export interface IconNextProps {
  $primaryColor: string;
}

export const IconNext = styled.div<IconNextProps>`
  cursor: pointer;
  font-weight: bold;
  position: relative;
  opacity: 0.7;
  font-size: 24px;
  transition: all 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  margin: -8px -5px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(5px);
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.5px;

  &:hover {
    opacity: 1;
    transform: scale(1.05);
    background: rgba(255, 255, 255, 0.1);
    border-color: ${props => props.$primaryColor || '#03dffc'};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    color: ${props => props.$primaryColor || '#03dffc'};
  }

  &:active {
    transform: scale(0.98);
  }
`;

export interface IconPiPProps {
  $primaryColor: string;
  $isActive?: boolean;
}

export const IconPiP = styled.div<IconPiPProps>`
  cursor: pointer;
  font-weight: bold;
  position: relative;
  opacity: ${props => props.$isActive ? 1 : 0.7};
  font-size: 24px;
  transition: all 0.05s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  margin: -8px -12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(5px);
  color: ${props => props.$isActive ? props.$primaryColor : '#ffffff'};
  font-weight: 600;
  letter-spacing: 0.5px;

  &:hover {
    opacity: 1;
    transform: scale(1.05);
    background: rgba(255, 255, 255, 0.1);
    border-color: ${props => props.$primaryColor || '#03dffc'};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    color: ${props => props.$primaryColor || '#03dffc'};
  }

  &:active {
    transform: scale(0.98);
  }
`;

export interface ItemPlaybackRateProps {
  $primaryColor: string;
}

/* Update the ItemPlaybackRate to be more specific and not affect other components: */
export const ItemPlaybackRate = styled(ItemControlBar)<ItemPlaybackRateProps>`
  cursor: pointer;
  font-weight: bold;
  max-width: 180px;
  z-index: 2000;

  /* Ensure this styling only applies to playback rate items */
  &.playback-rate-menu {
    /* All the enhanced styling goes here */
  }

  & > div:first-child {
    background: linear-gradient(145deg, #1a1a1a, #2d2d2d);
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    margin-bottom: 10px;
    position: relative;
    z-index: 2001;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    overflow: hidden;

    /* Only apply enhanced item styling to direct children */
    > .title {
      font-size: 16px;
      font-weight: 600;
      padding: 16px 18px 12px;
      margin: 0;
      color: #ffffff;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-size: 13px;
    }

    > .item {
      /* All item styling here - only affects direct children */
      background: transparent;
      display: flex;
      font-size: 15px;
      padding: 12px 18px;
      cursor: pointer;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      flex-direction: row;
      align-items: center;
      position: relative;
      color: #e0e0e0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: linear-gradient(135deg, ${props => props.$primaryColor || '#03dffc'}20, ${props => props.$primaryColor || '#03dffc'}10);
        color: #ffffff;
        transform: translateX(4px);
        padding-left: 22px;
        
        &::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, ${props => props.$primaryColor || '#03dffc'}, ${props => props.$primaryColor || '#03dffc'}80);
          border-radius: 0 2px 2px 0;
        }
      }

      /* Rest of item styling... */
    }
  }

  animation: ${slideInUp} 0.2s cubic-bezier(0.4, 0, 0.2, 1);
`;

export const ItemNext = styled(ItemControlBar)`
  max-width: 400px;
  overflow: visible; /* Changed from hidden to visible */
  right: -10px; /* Reduced offset to prevent cutoff */

  & > div:first-child {
    background: linear-gradient(145deg, #1a1a1a, #2d2d2d);
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    margin-right: 10px; /* Add margin to ensure it doesn't get cut off */

    .title {
      font-size: 16px;
      font-weight: 600;
      padding: 16px 18px 12px;
      margin: 0;
      color: #ffffff;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-size: 13px;
    }

    .item {
      background: transparent;
      display: flex;
      flex-direction: column;
      font-size: 15px;
      padding: 12px 18px;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      color: #e0e0e0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);

      &:last-child {
        border-bottom: none;
      }
    }
    
    .bold {
      font-weight: 600;
    }
  }

  animation: ${slideInUp} 0.2s cubic-bezier(0.4, 0, 0.2, 1);
`;

export const ItemPlaylist = styled(ItemControlBar)`
  max-width: 400px;
  overflow: hidden;

  & > div:first-child {
    background: linear-gradient(145deg, #1a1a1a, #2d2d2d);
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    padding-right: 6px; /* Add padding to accommodate the transform */

    .bold {
      font-weight: 600;
    }

    .title {
      font-size: 16px;
      font-weight: 600;
      padding: 16px 18px 12px;
      margin: 0;
      color: #ffffff;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-size: 13px;
    }

    .list-playback {
      display: flex;
      flex-direction: column;
      max-height: 400px;
      overflow: hidden;

      &::-webkit-scrollbar-track {
        background-color: rgba(255, 255, 255, 0.05);
      }

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        
        &:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      }

      .item-playback {
        background: transparent;
        display: flex;
        flex-direction: row;
        font-size: 14px;
        padding: 12px 18px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        color: #e0e0e0;
        position: relative;
        margin-right: -6px; /* Negative margin to offset container padding */

        &:last-child {
          border-bottom: none;
        }

        &:hover {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
          color: #ffffff;
          transform: translateX(4px);
          
          &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: linear-gradient(180deg, #e50914, #e5091480);
            border-radius: 0 2px 2px 0;
          }

          .bold span:first-child {
            color: #e50914;
            font-weight: 700;
          }
        }

        .bold {
          display: flex;
          align-items: center;
          width: 100%;
          
          span:first-child {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            min-width: 35px;
            text-align: center;
            margin-right: 12px;
            transition: all 0.2s ease;
          }
        }

        .percent {
          height: 3px;
          width: 80px;
          margin-left: auto;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
          
          &::after {
            content: '';
            display: block;
            height: 100%;
            width: 60%; /* This should be dynamic based on actual percent */
            background: #e50914;
            border-radius: 2px;
          }
        }

        &.selected {
          background: linear-gradient(135deg, #e5091420, #e5091410);
          color: #ffffff;
          
          .bold span:first-child {
            background: #e50914;
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(229, 9, 20, 0.3);
          }
        }
      }
    }
  }
`;

export const PreviewImage = styled.div`
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.8);
  pointer-events: none;
  padding: 8px !important; /* Add !important to override any conflicting styles */
  border-radius: 4px;
  border: 1px solid #333;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  
  /* Optimize for smooth rendering */
  will-change: transform;
  transform: translateZ(0); /* Hardware acceleration */
  transition: none; /* Disable transitions for immediate response */
  backdrop-filter: none; /* Disable backdrop filter for better performance */

  img {
    width: 120px;
    height: 68px;
    border-radius: 2px;
    border: 1px solid #555;
    object-fit: cover;
    margin: 0;
    padding: 0;
  }

  .sprite-thumbnail {
    border-radius: 2px;
    border: 1px solid #555;
    margin: 0;
    padding: 0;
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
    white-space: nowrap;
    
    /* Optimize for smooth rendering */
    will-change: auto;
    transform: translateZ(0);
    transition: none;
    backdrop-filter: none;
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
    padding: 0; /* Reset padding for loading fallback */

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
      padding: 0; /* Reset padding for text */
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

export const OperationOverlay = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 25px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2000; // Ensure it's above other elements
  font-size: 1.8em; // Larger font size for better visibility
  font-weight: 500;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  opacity: 0;
  animation: fadeInOutOverlay 1s ease-in-out;

  svg {
    font-size: 1.5em; // Icon size relative to text
  }

  @keyframes fadeInOutOverlay {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
    20%, 80% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
  }
`;

export const AutoplayOverlay = styled.div<{
  $primaryColor: string;
  $secondaryColor: string;
  $show: boolean;
}>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 50px;
  z-index: 1000;
  cursor: pointer;
  transition: all 0.5s ease-out;
  opacity: ${props => props.$show ? 1 : 0};
  pointer-events: ${props => props.$show ? 'auto' : 'none'};

  .section-main {
    margin: auto 0;
    padding-top: 100px;
    padding-left: 100px;
    color: #ffffff;

    .subtitle {
      color: ${props => props.$primaryColor};
      font-size: 1.1em;
      margin-bottom: 5px;
      font-weight: normal;
    }

    .title {
      color: #ffffff;
      font-weight: bold;
      font-size: 3em;
      margin: 10px 0;
      line-height: 1.1;
    }

    .subtitle-text {
      color: ${props => props.$secondaryColor};
      font-size: 20px;
      font-weight: normal;
      margin-top: -5px;
      opacity: 0.9;
    }
  }

  .play-button-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    align-items: center;

    .play-button {
      width: 100px;
      height: 120px;
      border-radius: 50%;
      background-color: ${props => props.$primaryColor};
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px ${props => props.$primaryColor}66;
      margin-bottom: 20px;

      &:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 25px ${props => props.$primaryColor}99;
      }

      .play-icon {
        font-size: 45px;
        margin-left: 8px;
        color: white;
      }
    }

    .play-text {
      color: #ffffff;
      font-size: 1.2em;
      text-align: center;
      font-weight: 500;
    }
  }

  .center-section {
    margin: auto;
    text-align: center;
    color: #ffffff;

    .center-title {
      font-size: 2.5em;
      margin-bottom: 20px;
      font-weight: bold;
    }

    .center-text {
      font-size: 1.2em;
      opacity: 0.8;
      margin: 0;
    }
  }

  .footer-section {
    margin-top: auto;
    margin-bottom: 50px;
    margin-left: auto;
    text-transform: uppercase;
    color: ${props => props.$secondaryColor};
    font-size: 0.9em;
    opacity: 0.7;
  }
`;

export const VolumeOverlay = styled.div<{ $primaryColor: string }>`
  position: absolute;
  top: 30px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 2000;
  font-size: 14px;
  font-weight: 500;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: ${fadeInOut} 2s ease-in-out;
  min-width: 120px;
  justify-content: center;
  align-items: center;

  .volume-icon {
    font-size: 16px;
    color: ${props => props.$primaryColor};
    display: flex;
    align-items: center;
  }

  .volume-bar {
    width: 60px;
    height: 4px;
    background-color: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;

    .volume-fill {
      height: 100%;
      background-color: ${props => props.$primaryColor};
      border-radius: 2px;
      transition: width 0.2s ease;
    }
  }
`;

export const VideoElement = styled.video`
  cursor: pointer;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
`;
