import { message } from "antd";

const ErrorHandler = (error, navigate, json={}) => {
    if (error instanceof Error) {
        console.log("this is an error");
        console.log(error.name);
        console.log(error.message);
        switch (error.message) {
            case "Failed to fetch":
                console.log("fetch error");
                navigate('/error', {state: { error: {
                    title: "Failed to Fetch", 
                    message: "It seems like your connection couldn't be established. Please check your internet and try reloading.",
                    buttons: [{
                        text: "Refresh",
                        type: "primary",
                        onClick: "refreshPage",
                    }]
                }}});
                // Navigate({ to: "/error", state: { error: {title: "error"} } })
                break;
        
            default:
                console.log("invalid error");
                break;
        }
    } else if (error instanceof Response || typeof(error) === "string") {
        console.log("this is a res error");
        console.log(json);
        const error_reason_type = typeof(error) === "string" ? error : json.error_reason
        const error_reason = error_reason_type || ""

        switch (error_reason) {
            case "user_logged_out":
                navigate('/signin', {state: { message: "Logged out. Please log in to continue." }})
                break;
            case "token_expired":
                localStorage.removeItem('token');
                navigate('/signin', {state: { message: "Please log in to continue." }})
                break;
            case "token_missing":
                navigate('/signin', {state: { message: "Please log in to continue." }})
                break;
            case "token_invalid":
                localStorage.removeItem('token');
                navigate('/signin', {state: { message: "Please log in to continue." }})
                break;
            case "user_not_exist":
                navigate('/signup', {state: { message: "We couldn't find your account." }})
                break;
            case "user_perm_banned":
                navigate('/error', {state: { error: {
                    title: "You are Permanently Banned", 
                    message: json.message,
                    with_divider: false,
                    buttons: [{
                        text: "Logout",
                        type: "primary",
                        onClick: "logoutUser",
                    }]
                }}});
                break;
            case "user_temp_banned":
                navigate('/error', {state: { error: {
                    title: "You are Temporarily Banned", 
                    message: json.message,
                    with_divider: false,
                    buttons: [{
                        text: "Logout",
                        type: "primary",
                        onClick: "logoutUser",
                    }]
                }}});
                break;
            case "bad_request":
                navigate('/error', {state: { error: {
                    title: "Bad Request", 
                    message: "Something seems off about the request you've made. Don't worry, it's probably just a simple mistake.",
                    with_divider: false,
                    buttons: [{
                        text: "Go Home",
                        type: "primary",
                        onClick: "redirectHome",
                    }]
                }}});
                break;
            case "unauthorized":
                navigate('/error', {state: { error: {
                    title: "Unauthorized", 
                    message: "You're not quite authorized to access the content. Time to log in and get that sorted.",
                    with_divider: false,
                    buttons: [{
                        text: "Signin",
                        type: "primary",
                        onClick: "redirectLogin",
                    }]
                }}});
                break;
            case "forbidden":
                navigate('/error', {state: { error: {
                    title: "Forbidden", 
                    message: "This request is hidden behind a wall, and you don't have the password.",
                    with_divider: false,
                    buttons: []
                }}});
                break;
            case "not_found":
                navigate('/error', {state: { error: {
                    title: "Not Found", 
                    message: "The content you're looking for seems to have vanished into thin air. It's like searching for a lost city, but the clues aren't adding up.",
                    with_divider: false,
                    buttons: [{
                        text: "Go Home",
                        type: "primary",
                        onClick: "redirectHome",
                    }]
                }}});
                break;
            case "internal_server":
                navigate('/error', {state: { error: {
                    title: "Internal Server", 
                    message: "The servers are having a moment. They're a bit overwhelmed, but they'll catch their breath soon. Give them a second.",
                    with_divider: false,
                    buttons: [{
                        text: "Refresh",
                        type: "primary",
                        onClick: "refreshPage",
                    }]
                }}});
                break;
            case "service_unavailable":
                // Redirect to maintenance page for service unavailable errors
                navigate('/maintenance');
                break;
            case "admin_token_missing":
                navigate('/admin/login', {state: { message: "Please log in to continue." }})
                break;
            case "admin_not_exist":
                navigate('/admin/login', {state: { message: "We couldn't find your account." }})
                break;
            case "admin_logged_out":
                localStorage.removeItem('admin_token');
                navigate('/admin/login', {state: { message: "Logged out. Please log in to continue." }})
                break;
            case "admin_access_denied":
                navigate('/error', {state: { error: {
                    title: "Admin Access Denied", 
                    message: json.message,
                    with_divider: false,
                    buttons: [{
                        text: "Signin",
                        type: "primary",
                        onClick: "redirectLogin",
                    }]
                }}});
                break;
            case "admin_token_expired":
                localStorage.removeItem('admin_token');
                navigate('/admin/login', {state: { message: "Please log in to continue." }})
                break;
            case "admin_token_invalid":
                localStorage.removeItem('admin_token');
                navigate('/admin/login', {state: { message: "Please log in to continue." }})
                break;
            case "video_not_found":
                navigate('/error', {state: { error: {
                    title: "Video not Found", 
                    message: "The video is missing, leaving the servers clueless. A quick check of the details will help you find the missing treasure.",
                    with_divider: false,
                    buttons: [{
                        text: "Go Home",
                        type: "primary",
                        onClick: "redirectHome",
                    }]
                }}});
                break;
            case "video_error":
                navigate('/error', {state: { error: {
                    title: "Video Error", 
                    message: "The video won't play due to a technical issue. It's an enigmatic glitch that our servers are working to unravel. Give us a moment to fix the mystery, and we'll have it playing smoothly soon.",
                    with_divider: false,
                    buttons: [{
                        text: "Go Home",
                        type: "primary",
                        onClick: "redirectHome",
                    }]
                }}});
                break;
            case "video_processing":
                navigate('/error', {state: { error: {
                    title: "Video Being Processed", 
                    message: "The video is undergoing a quick makeover behind the scenes to fix a playback hiccup. Our servers are working their magic to get it ready for you. Give it a few minutes and check back—it'll be worth the wait.",
                    with_divider: false,
                    buttons: [{
                        text: "Retry",
                        type: "primary",
                        onClick: "refreshPage",
                    }, {
                        text: "Go Home",
                        type: "default",
                        onClick: "redirectHome",
                    }]
                }}});
                break;
            default:
                console.log("invalid error");
                break;
        }
        
    } else {
        console.log("invalid error");
    }

    return false
}

export default ErrorHandler