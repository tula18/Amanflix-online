from datetime import datetime
import logging
import os
from logging.handlers import RotatingFileHandler
import re
import inspect

# Enhanced ANSI color codes
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    ITALIC = "\033[3m"
    UNDERLINE = "\033[4m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    GRAY = "\033[90m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    BG_BLUE = "\033[44m"

# Initialize the rotating file logger
def _setup_file_logger():
    # Create logs directory if it doesn't exist
    logs_dir = os.path.join(os.getcwd(), 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    
    # Configure the main logger
    logger = logging.getLogger('amanflix')
    logger.setLevel(logging.DEBUG)
    logger.propagate = False  # Prevent propagation to parent loggers
    
    # Clear any existing handlers
    if logger.hasHandlers():
        logger.handlers.clear()
    
    # Create rotating file handler for general logs
    general_handler = RotatingFileHandler(
        os.path.join(logs_dir, 'amanflix.log'),
        maxBytes=10485760,  # 10MB
        backupCount=10,
        encoding='utf-8'
    )
    general_handler.setLevel(logging.INFO)
    general_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    logger.addHandler(general_handler)
    
    # Create a separate logger for API requests
    api_logger = logging.getLogger('amanflix.api')
    api_logger.setLevel(logging.INFO)
    api_logger.propagate = False  # Prevent propagation to parent loggers
    
    if api_logger.hasHandlers():
        api_logger.handlers.clear()
    
    # Create rotating file handler specifically for API requests
    api_handler = RotatingFileHandler(
        os.path.join(logs_dir, 'api_requests.log'),
        maxBytes=10485760,  # 10MB
        backupCount=10,
        encoding='utf-8'
    )
    api_handler.setLevel(logging.INFO)
    api_handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
    api_logger.addHandler(api_handler)
    
    return logger, api_logger

# Initialize loggers
logger, api_logger = _setup_file_logger()

# Helper function to strip ANSI color codes and replace Unicode characters for file logging
def _strip_ansi_codes(text):
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    # Remove ANSI color codes
    clean_text = ansi_escape.sub('', text)
    # Replace Unicode tree characters with ASCII alternatives
    clean_text = clean_text.replace('└─', '|_').replace('├─', '|-').replace('│', '|')
    clean_text = clean_text.replace('┌', '+').replace('┐', '+').replace('└', '+').replace('┘', '+')
    clean_text = clean_text.replace('─', '-').replace('═', '=').replace('║', '|').replace('╚', '+').replace('╗', '+').replace('╔', '+').replace('╝', '+')
    return clean_text

def get_caller_info():
    """Get caller filename and line number"""
    frame = inspect.currentframe().f_back.f_back  # Two levels back to get actual caller
    filename = os.path.basename(frame.f_code.co_filename)
    lineno = frame.f_lineno
    return f"{filename}:{lineno}"

def log_info(message):
    """Print information messages in blue"""
    source = get_caller_info()
    console_msg = f"{Colors.BLUE}ℹ {Colors.RESET}[{source}] {message}"
    print(console_msg)
    logger.info(_strip_ansi_codes(f"ℹ [{source}] {message}"))

def log_success(message):
    """Print success messages in green"""
    source = get_caller_info()
    console_msg = f"{Colors.GREEN}✓ {Colors.RESET}[{source}] {message}"
    print(console_msg)
    logger.info(_strip_ansi_codes(f"✓ [{source}] {message}"))

def log_warning(message):
    """Print warning messages in yellow"""
    source = get_caller_info()
    console_msg = f"{Colors.YELLOW}⚠ {Colors.RESET}[{source}] {message}"
    print(console_msg)
    logger.warning(_strip_ansi_codes(f"⚠ [{source}] {message}"))

def log_error(message):
    """Print error messages in red"""
    source = get_caller_info()
    console_msg = f"{Colors.RED}✗ {Colors.RESET}[{source}] {message}"
    print(console_msg)
    logger.error(_strip_ansi_codes(f"✗ [{source}] {message}"))

def log_section(title):
    """Print a section header"""
    console_msg = f"\n{Colors.BOLD}{Colors.WHITE}┌──{Colors.BLUE} {title.upper()} {Colors.WHITE}{'─' * (68 - len(title))}┐{Colors.RESET}"
    print(console_msg)
    logger.info(_strip_ansi_codes(f"===== {title.upper()} ====="))

def log_section_end():
    """Print a section end delimiter"""
    console_msg = f"{Colors.BOLD}{Colors.WHITE}└{'─' * 72}┘{Colors.RESET}\n"
    print(console_msg)
    logger.info("=" * 50)

def log_step(message):
    """Print a step within a section"""
    console_msg = f"{Colors.WHITE}│{Colors.RESET} {Colors.CYAN}• {Colors.RESET}{message}"
    print(console_msg)
    logger.info(_strip_ansi_codes(f"• {message}"))

def log_substep(message):
    """Print a sub-step with indentation"""
    console_msg = f"{Colors.WHITE}│  {Colors.RESET}{Colors.CYAN}└─{Colors.RESET} {message}"
    print(console_msg)
    logger.info(_strip_ansi_codes(f"  └─ {message}"))

def log_data(label, value):
    """Print a data point with label and value"""
    console_msg = f"{Colors.WHITE}│{Colors.RESET} {Colors.CYAN}{label}:{Colors.RESET} {value}"
    print(console_msg)
    logger.info(_strip_ansi_codes(f"{label}: {value}"))

def log_debug(message):
    """Print debug message (dim gray)"""
    console_msg = f"{Colors.GRAY}DEBUG: {message}{Colors.RESET}"
    print(console_msg)
    logger.debug(_strip_ansi_codes(f"DEBUG: {message}"))

def log_api(method, endpoint, status_code=None, user=None, ip=None, duration=None):
    """Log API call with method and endpoint"""
    # Skip logging OPTIONS requests entirely
    if (method.upper() == "OPTIONS"):
        return
        
    # Console output with colors
    timestamp = datetime.now().strftime('%H:%M:%S')
    method_color = {
        'GET': Colors.GREEN,
        'POST': Colors.BLUE,
        'PUT': Colors.YELLOW,
        'PATCH': Colors.MAGENTA,
        'DELETE': Colors.RED
    }.get(method.upper(), Colors.WHITE)
    
    status_info = ""
    if status_code:
        if 200 <= status_code < 300:
            status_info = f"{Colors.GREEN}[{status_code}]{Colors.RESET}"
        elif 400 <= status_code < 500:
            status_info = f"{Colors.YELLOW}[{status_code}]{Colors.RESET}"
        else:
            status_info = f"{Colors.RED}[{status_code}]{Colors.RESET}"
    
    # Authentication status indicator
    auth_status = f"Auth: {Colors.GREEN}✓{Colors.RESET} " if user else f"Auth: {Colors.RED}✗{Colors.RESET} "
    
    # IP address and duration formatting
    ip_info = f"{Colors.CYAN}{ip}{Colors.RESET} " if ip else ""
    duration_info = f"{Colors.MAGENTA}{duration}ms{Colors.RESET}" if duration else ""
    
    console_msg = f"{Colors.DIM}{timestamp}{Colors.RESET} {auth_status}{ip_info}{method_color}{method.upper()}{Colors.RESET} {endpoint} {status_info} {duration_info}"
    print(console_msg)
    
    # File logging without colors
    auth_text = f"Auth:✓ {user}" if user else "Auth:✗"
    ip_text = f"{ip} " if ip else ""
    status_text = f"[{status_code}]" if status_code else ""
    duration_text = f"{duration}ms" if duration else ""
    
    log_entry = f"{auth_text} {ip_text}{method.upper()} {endpoint} {status_text} {duration_text}".strip()
    api_logger.info(log_entry)

def get_logger():
    """Return the logger instance for custom logging"""
    return logger

def log_fancy(text, log_level="info"):
    """Print fancy formatted text while also logging its plain content
    
    Args:
        text: The formatted text to print (with color codes)
        log_level: Level to log at ("info", "success", "warning", "error", "debug")
    """
    # Print colorful version to console
    print(text)
    
    # Log plain version to file
    plain_text = _strip_ansi_codes(text)
    if log_level == "success":
        logger.info(plain_text)
    elif log_level == "warning":
        logger.warning(plain_text)
    elif log_level == "error":
        logger.error(plain_text)
    elif log_level == "debug":
        logger.debug(plain_text)
    else:  # Default to info
        logger.info(plain_text)

def _get_display_width(text):
    """Calculate the display width of text, accounting for emojis and wide characters
    
    Args:
        text: The text to measure
        
    Returns:
        int: The display width of the text
    """
    import unicodedata
    
    width = 0
    i = 0
    while i < len(text):
        char = text[i]
        code_point = ord(char)
        
        # Handle emoji sequences and combining characters
        if code_point == 0x200D:  # Zero Width Joiner (used in emoji sequences)
            # Skip ZWJ, it doesn't add width
            i += 1
            continue
        elif 0x1F1E6 <= code_point <= 0x1F1FF:  # Regional indicator symbols (flags)
            width += 2
            i += 1
            continue
        elif 0x1F600 <= code_point <= 0x1F64F:  # Emoticons
            width += 2
            i += 1
            continue
        elif 0x1F300 <= code_point <= 0x1F5FF:  # Misc Symbols and Pictographs
            width += 2
            i += 1
            continue
        elif 0x1F680 <= code_point <= 0x1F6FF:  # Transport and Map Symbols
            width += 2
            i += 1
            continue
        elif 0x1F700 <= code_point <= 0x1F77F:  # Alchemical Symbols
            width += 2
            i += 1
            continue
        elif 0x1F780 <= code_point <= 0x1F7FF:  # Geometric Shapes Extended
            width += 2
            i += 1
            continue
        elif 0x1F800 <= code_point <= 0x1F8FF:  # Supplemental Arrows-C
            width += 2
            i += 1
            continue
        elif 0x1F900 <= code_point <= 0x1F9FF:  # Supplemental Symbols and Pictographs
            width += 2
            i += 1
            continue
        elif 0x1FA00 <= code_point <= 0x1FA6F:  # Chess Symbols
            width += 2
            i += 1
            continue
        elif 0x1FA70 <= code_point <= 0x1FAFF:  # Symbols and Pictographs Extended-A
            width += 2
            i += 1
            continue
        elif 0x2600 <= code_point <= 0x26FF:  # Miscellaneous Symbols (includes ✅, ⚠️)
            width += 2
            i += 1
            continue
        elif 0x2700 <= code_point <= 0x27BF:  # Dingbats
            width += 2
            i += 1
            continue
        elif unicodedata.combining(char):  # Combining characters (don't add width)
            i += 1
            continue
        else:
            # Use East Asian Width property for other characters
            eaw = unicodedata.east_asian_width(char)
            if eaw in ('F', 'W'):  # Fullwidth or Wide
                width += 2
            else:  # Narrow, Half-width, Neutral, Ambiguous
                width += 1
        
        i += 1
    
    return width

def log_banner(title, content=None, style="info"):
    """Print and log a banner with title and optional content
    
    Args:
        title: The banner title
        content: Optional content under the title
        style: "info", "success", "warning", "error"
    """
    # Select colors based on style
    colors = {
        "info": Colors.BLUE,
        "success": Colors.GREEN,
        "warning": Colors.YELLOW,
        "error": Colors.RED
    }
    border_color = colors.get(style, Colors.BLUE)
    
    # Calculate width based on the largest text content using display width
    texts_to_measure = [title]
    if content:
        texts_to_measure.append(content)
    
    # Find the longest text and add padding (minimum width of 40, extra padding of 4)
    max_text_width = max(_get_display_width(text) for text in texts_to_measure)
    width = max(max_text_width + 4, 40)  # 4 for padding (2 spaces + 2 for borders)      # Create the banner
    banner = f"\n{Colors.BOLD}{border_color}┌{'─' * width}┐{Colors.RESET}\n"
    banner += f"{Colors.BOLD}{border_color}│ {Colors.WHITE}{title}{border_color}{' ' * (width - _get_display_width(title) - 2)} │{Colors.RESET}\n"
    
    # Add content if provided
    if content:
        banner += f"{Colors.BOLD}{border_color}│ {Colors.WHITE}{content}{border_color}{' ' * (width - _get_display_width(content) - 2)} │{Colors.RESET}\n"
    
    # Close the banner
    banner += f"{Colors.BOLD}{border_color}└{'─' * width}┘{Colors.RESET}\n"
    
    # Print and log
    log_fancy(banner, style)

def log_status(ready=True, message=None, current_time=None):
    """Log application ready status with styled banner"""
    if ready:
        if not current_time:
            current_time = datetime.now().strftime('%H:%M:%S')
        
        status = f"✅ AMANFLIX API READY AT {current_time}"
        log_banner(status, style="success")
        
        # Add the bottom border line
        bottom_border = f"{Colors.BOLD}{Colors.CYAN}{'─' * 70}{Colors.RESET}\n"
        log_fancy(bottom_border)
    else:
        log_banner(f"⚠️ AMANFLIX API NOT READY: {message}", style="warning")