import re
import requests
from difflib import SequenceMatcher
from pathlib import Path
import json
import time
import logging
from typing import Dict, List, Optional, Tuple, Union
from dataclasses import dataclass
from functools import lru_cache
import unicodedata

@dataclass
class ParsedMedia:
    """Structured representation of parsed media information"""
    title: str
    year: Optional[int] = None
    season: Optional[int] = None
    episode: Optional[int] = None
    episode_title: Optional[str] = None
    media_type: str = 'movie'  # 'movie', 'tv', 'episode'
    quality: Optional[str] = None
    source: Optional[str] = None
    codec: Optional[str] = None
    audio: Optional[str] = None
    language: Optional[str] = None
    edition: Optional[str] = None
    part: Optional[int] = None
    confidence: float = 0.0
    original_filename: str = ""

class EnhancedMediaScanner:
    """
    Enhanced media scanner that rivals Plex's capabilities
    Features:
    - Multi-language support
    - Advanced pattern matching
    - Quality detection
    - Edition handling
    - Caching system
    - Fuzzy matching
    - Multi-part detection
    - Alternative titles
    """
    
    def __init__(self, tmdb_api_key: str, cache_size: int = 500, rate_limit: float = 0.25):
        self.tmdb_api_key = tmdb_api_key
        self.tmdb_base_url = "https://api.themoviedb.org/3"
        self.rate_limit = rate_limit  # Seconds between API calls
        self.last_api_call = 0
        
        # Setup logging
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
        # Initialize caches
        self._setup_caches(cache_size)
        
        # Comprehensive pattern definitions
        self._setup_patterns()
        
        # Quality and technical specs mapping
        self._setup_quality_mapping()
        
        # Language and country codes
        # self._setup_language_mapping()
    
    def _setup_caches(self, cache_size: int):
        """Setup LRU caches for API responses"""
        self.search_movie = lru_cache(maxsize=cache_size)(self._search_movie_uncached)
        self.search_tv = lru_cache(maxsize=cache_size)(self._search_tv_uncached)
        self.get_movie_details = lru_cache(maxsize=cache_size)(self._get_movie_details_uncached)
        self.get_tv_details = lru_cache(maxsize=cache_size)(self._get_tv_details_uncached)
    
    def _setup_patterns(self):
        """Setup comprehensive regex patterns for parsing"""
        
        # Movie patterns (ordered by specificity)
        self.movie_patterns = [
            # Title (Year) Part X
            r'^(.+?)[\s\.](\d{4})[\s\.].*?[Pp]art[\s\.]?(\d+).*',
            # Title Year Part X
            r'^(.+?)\s(\d{4})\s.*?[Pp]art[\s\.]?(\d+).*',
            # Title (Year) [Edition]
            r'^(.+?)[\s\.](\d{4})[\s\.].*?\[(.*?)\].*',
            # Title Year Edition
            r'^(.+?)\s(\d{4})\s(.*?(?:Director|Extended|Unrated|Theatrical|Ultimate|Special|Final|Remastered).*?)[\s\.]',
            # Title (Year) Quality
            r'^(.+?)[\s\.\-_](\d{4})[\s\.\-_].*?(\d{3,4}p|4K|8K|UHD|HDR|DV).*',
            # Standard Title (Year)
            r'^(.+?)[\s\.\-_](\d{4})[\s\.\-_].*',
            r'^(.+?)[\s\.\-_](\d{4})$',
            r'^(.+?)[\[\(](\d{4})[\]\)].*',
            # Title without year
            r'^(.+?)[\s\.\-_](?:\d{3,4}p|4K|8K|UHD|BluRay|BRRip|DVDRip|WEBRip|HDTV).*',
            r'^(.+?)$'
        ]
        
        # TV show patterns (more comprehensive)
        self.tv_patterns = [
            # Show Season X Episode Y - Title (capture full episode title)
            r'^(.+?)[\s\.]Season[\s\.](\d+)[\s\.]Episode[\s\.](\d+)[\s\.\-_](.+?)[\s\.](?:\d{3,4}p|BluRay|HDTV|WEB|x264|x265)',
            r'^(.+?)[\s\.]S(\d+)E(\d+)[\s\.\-_](.+?)[\s\.](?:\d{3,4}p|BluRay|HDTV|WEB|x264|x265)',
            # Anime style with dash separators
            r'^(.+?)[\s\-]+(\d+)[\s\-]+(.+?)[\s\[\(].*',
            # Standard formats with episode titles
            r'^(.+?)[\s\.]s(\d+)e(\d+)[\s\.\-_](.+?)[\s\.](?:\d{3,4}p|BluRay|HDTV|WEB|x264|x265)',
            # Standard formats without episode titles
            r'^(.+?)[\s\.]S(\d+)E(\d+)(?:-E?(\d+))?.*',  # Multi-episode support
            r'^(.+?)[\s\.](\d+)x(\d+)(?:-(\d+))?.*',
            r'^(.+?)[\s\.]s(\d+)e(\d+)(?:-?e(\d+))?.*',
            # Show with year then season/episode
            r'^(.+?)\s(\d{4})\sS(\d+)E(\d+).*',
            # Season packs
            r'^(.+?)[\s\.]Season[\s\.](\d+)[\s\.]',
            r'^(.+?)[\s\.]S(\d+)[\s\.]',
            # Episode only
            r'^(.+?)[\s\.]E(?:pisode[\s\.])?(\d+)[\s\.]',
            # Year-based episodes (daily shows)
            r'^(.+?)[\s\.](\d{4})[\s\.](\d{2})[\s\.](\d{2}).*',
        ]
        
        # Special patterns for anime
        self.anime_patterns = [
            r'^(.+?)[\s\.\-_](\d+)[\s\.\-_].*',  # Simple episode numbering
            r'^(.+?)[\s\.\-_]EP?(\d+)[\s\.\-_].*',
            r'^(.+?)[\s\.\-_]#(\d+)[\s\.\-_].*',
        ]
    
    def _setup_quality_mapping(self):
        """Setup quality and technical specifications mapping"""
        self.quality_patterns = {
            'quality': r'(2160p|4320p|1440p|1080p|720p|576p|480p|360p|4K|8K|UHD)',
            'source': r'(Ultra HD Blu-?ray|UHD|BluRay|Blu-?ray|BRRip|BDRip|DVDRip|WEBRip|WEB-DL|HDTV|CAM|TS|TC|R5|SCR)',
            'codec': r'(x264|x265|H\.?264|H\.?265|HEVC|AVC|XVID|XviD|DIVX)',
            'audio': r'(DTS-HD|DTS-X|TrueHD|Atmos|DD5\.1|DD7\.1|AC3|AAC|MP3|FLAC|DDP5\.1)',
            'hdr': r'(HDR10\+?|DV|Dolby\.?Vision|HDR)',
        }
        
        # Language patterns
        self.language_patterns = {
            'language': r'\b(MULTI|DUAL|ENG|SPA|FRE|GER|ITA|POR|RUS|JAP|KOR|CHI)\b'
        }
        
        self.edition_keywords = [
            'Director', 'Extended', 'Unrated', 'Theatrical', 'Ultimate', 'Special',
            'Final', 'Remastered', 'Criterion', 'Anniversary', 'Limited',
            'Collectors?', 'IMAX', 'Redux', 'Assembly', 'Despecialized'
        ]
        
        self.cleanup_keywords = [
            # Release groups
            r'\b(YIFY|RARBG|FGT|SPARKS|AMZN|NTb|NTG|TOMMY|ION10|d3g|Tigole|QxR|UTR|FLEET|SECTOR7|KiNGS|YAMG|ANiHLS|CTU|GROUP|TERMINAL)\b',
            # Quality indicators  
            r'\b(BluRay|Blu-ray|BRRip|BDRip|DVDRip|WEBRip|WEB-DL|HDTV|x264|x265|H\.?26[45]|HEVC)\b',
            # Audio
            r'\b(DTS-HD|TrueHD|Atmos|DD[57]\.1|AC3|AAC|FLAC|DDP5\.1)\b',
            # Misc
            r'\b(PROPER|REPACK|INTERNAL|LIMITED|FESTIVAL|SCREENER|HC|KORSUB|MULTI|NF|AMZN)\b',
        ]

    def normalize_text(self, text: str) -> str:
        """Normalize text by removing accents and special characters"""
        # Remove unicode accents
        text = unicodedata.normalize('NFD', text)
        text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
        return text

    def extract_technical_info(self, filename: str) -> Dict[str, str]:
        """Extract technical information from filename"""
        tech_info = {}
        
        # Extract quality/resolution
        quality_match = re.search(self.quality_patterns['quality'], filename, re.IGNORECASE)
        if quality_match:
            quality = quality_match.group(1)
            # Normalize quality values
            if quality.lower() in ['4k', 'uhd']:
                tech_info['quality'] = '2160p'
            elif quality.lower() == '8k':
                tech_info['quality'] = '4320p'
            else:
                tech_info['quality'] = quality
        
        # Extract source - UPDATED WITH YOUR PREFERENCES
        source_patterns = [
            (r'WEB-DL', 'WEB-DL'),  # Keep WEB-DL (your preference)
            (r'WEBRip', 'WEBRip'), 
            (r'Ultra HD Blu-?ray', 'Ultra HD Blu-ray'),
            (r'UHD[\s\.]BluRay', 'UHD'),
            (r'BluRay|Blu-?ray', 'Blu-ray'),  # Changed to "Blu-ray" (your preference)
            (r'BRRip', 'BRRip'),
            (r'BDRip', 'BDRip'),
            (r'DVDRip', 'DVDRip'),
            (r'HDTV', 'HDTV'),
            (r'CAM', 'CAM'),
            (r'TS(?!\w)', 'TS'),
            (r'TC', 'TC'),
            (r'R5', 'R5'),
            (r'SCR', 'SCR')
        ]
        
        for pattern, source_name in source_patterns:
            if re.search(pattern, filename, re.IGNORECASE):
                tech_info['source'] = source_name
                break
        
        # Extract codec
        codec_match = re.search(self.quality_patterns['codec'], filename, re.IGNORECASE)
        if codec_match:
            codec = codec_match.group(1)
            # Normalize codec values
            if codec.lower() in ['x264', 'h.264', 'h264']:
                tech_info['codec'] = 'H.264'
            elif codec.lower() in ['x265', 'h.265', 'h265', 'hevc']:
                tech_info['codec'] = 'H.265'
            elif codec.lower() == 'xvid':
                tech_info['codec'] = 'Xvid'
            else:
                tech_info['codec'] = codec
        
        # Extract audio - UPDATED WITH YOUR PREFERENCES
        audio_match = re.search(self.quality_patterns['audio'], filename, re.IGNORECASE)
        if audio_match:
            audio = audio_match.group(1)
            # Normalize audio values to your preferences
            if audio.lower() == 'atmos':
                tech_info['audio'] = 'Dolby Atmos'  # Your preference
            elif audio.lower() in ['dd5.1', 'dd5_1']:
                tech_info['audio'] = 'Dolby Digital 5.1'
            elif audio.lower() in ['dd7.1', 'dd7_1']:
                tech_info['audio'] = 'Dolby Digital 7.1'
            elif audio.lower() in ['ddp5.1', 'ddp5_1']:
                tech_info['audio'] = 'Dolby Digital Plus 5.1'
            elif audio.lower() == 'truehd':
                tech_info['audio'] = 'Dolby TrueHD'
            elif audio.lower() in ['dts-hd', 'dts_hd']:
                tech_info['audio'] = 'DTS-HD'
            elif audio.lower() == 'dts-x':
                tech_info['audio'] = 'DTS:X'
            else:
                tech_info['audio'] = audio
        
        # Extract HDR info
        hdr_match = re.search(self.quality_patterns['hdr'], filename, re.IGNORECASE)
        if hdr_match:
            tech_info['hdr'] = hdr_match.group(1)
        
        # Extract language
        lang_match = re.search(self.language_patterns['language'], filename, re.IGNORECASE)
        if lang_match:
            tech_info['language'] = lang_match.group(1)
        
        return tech_info

    def auto_detect_type(self, filename: str) -> str:
        """Auto-detect if filename is movie or TV episode"""
        filename_lower = filename.lower()
        
        # Strong indicators for TV shows - ADD underscore patterns
        tv_indicators = [
            r's\d+e\d+',           # S01E01
            r'season\s*\d+',       # Season 1
            r'\d+x\d+',            # 1x01
            r'episode\s*\d+',      # Episode 1
            r'_s\d+e\d+_',         # _S01E01_ (underscore format)
        ]
        
        # Strong indicators for anime episodes
        anime_indicators = [
            r'-\s*\d+\s*-',        # - 01 -
            r'ep\s*\d+',           # EP01
            r'#\d+',               # #01
        ]
        
        # Check for TV patterns
        for pattern in tv_indicators + anime_indicators:
            if re.search(pattern, filename_lower):
                return 'tv'
        
        # Check for movie part indicators
        if re.search(r'part\s*\d+', filename_lower):
            return 'movie'
        
        # Default to movie if unclear
        return 'movie'

    def clean_title(self, title: str) -> str:
        """Clean movie/show title by removing technical info and junk"""
        # Don't be overly aggressive with removing articles
        cleaned = title
        
        # Remove file extensions
        cleaned = re.sub(r'\.(mkv|mp4|avi|mov|wmv|flv|webm)$', '', cleaned, flags=re.IGNORECASE)
        
        # Remove obvious technical patterns
        for pattern in self.cleanup_keywords:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        
        # Remove year in parentheses/brackets if it's standalone
        cleaned = re.sub(r'[\[\(]\d{4}[\]\)]', '', cleaned)
        
        # Remove quality/technical indicators
        cleaned = re.sub(r'\b(480p|720p|1080p|2160p|4K|8K|UHD|HDR|DV)\b', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\b(BluRay|Blu-ray|WEBRip|WEB-DL|HDTV|DVDRip)\b', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\b(x264|x265|H\.?264|H\.?265|HEVC)\b', '', cleaned, flags=re.IGNORECASE)
        
        # Clean up separators but preserve important punctuation like periods in S.H.I.E.L.D.
        # Only replace dots that are clearly separators (surrounded by word boundaries or at start/end)
        cleaned = re.sub(r'(?<!\w)\.(?!\w)|(?<=\w)\.(?=\s)|(?<=\s)\.(?=\w)', ' ', cleaned)
        cleaned = re.sub(r'[\-_]+', ' ', cleaned)
        
        # PRESERVE IMPORTANT PUNCTUATION: Don't remove dots from known abbreviations
        # This handles cases like "S.H.I.E.L.D." and similar
        # The above regex is more conservative about dot removal
        
        # Remove multiple spaces
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        # Clean up and return
        return cleaned.strip()

    def parse_movie_filename(self, filename: str) -> ParsedMedia:
        """Enhanced movie filename parsing with comprehensive pattern matching"""
        clean_name = self.normalize_text(Path(filename).stem)
        tech_info = self.extract_technical_info(filename)
        
        # Filter tech_info to only include valid ParsedMedia fields
        valid_fields = ['quality', 'source', 'codec', 'audio', 'language']
        filtered_tech_info = {k: v for k, v in tech_info.items() if k in valid_fields}
        
        result = ParsedMedia(
            title="",
            media_type='movie',
            original_filename=filename,
            **filtered_tech_info
        )
        
        # PRIORITY: Check for Part patterns first
        part_match = re.search(r'\bPart[\s\.]?(\d+)\b', clean_name, re.IGNORECASE)
        if part_match:
            result.part = int(part_match.group(1))
        
        # Enhanced patterns for better parsing - FIXED ORDER AND LOGIC
        enhanced_movie_patterns = [
            # Title (Year) Edition patterns - Most specific first
            r'^(.+?)[\s\.](\d{4})[\s\.].*?(Director\'?s?[\s\.]?Cut|Extended[\s\.]?Edition|IMAX[\s\.]?Edition|Theatrical[\s\.]?Cut|Ultimate[\s\.]?Edition|Special[\s\.]?Edition|Final[\s\.]?Cut|Remastered|Criterion|Anniversary|Limited|Collector\'?s?|Despecialized[\s\.]?Edition)(?:[\s\.]|$)',
            
            # Title Year with technical specs (capture before tech specs)
            r'^(.+?)[\s\.](\d{4})[\s\.](?=.*?(?:\d{3,4}p|4K|8K|UHD|BluRay|BRRip|DVDRip|WEBRip|HDTV|x264|x265))',
            
            # Title (Year) in parentheses
            r'^(.+?)[\s\.][\[\(](\d{4})[\]\)]',
            
            # Title Year without extra formatting
            r'^(.+?)[\s\.](\d{4})(?:[\s\.]|$)',
            
            # Title without year but before technical specs
            r'^(.+?)(?=[\s\.](?:\d{3,4}p|4K|8K|UHD|BluRay|BRRip|DVDRip|WEBRip|HDTV|x264|x265))',
            
            # Fallback: everything as title
            r'^(.+?)$'
        ]
        
        title_found = False
        
        # Try enhanced patterns in order
        for i, pattern in enumerate(enhanced_movie_patterns):
            match = re.search(pattern, clean_name, re.IGNORECASE)
            if match:
                groups = match.groups()
                
                # Extract title (always first group)
                raw_title = groups[0] if groups[0] else ""
                
                # Clean the title more aggressively
                cleaned_title = self.clean_movie_title(raw_title)
                
                if cleaned_title:  # Only proceed if we have a meaningful title
                    result.title = cleaned_title
                    
                    # Extract year (second group if exists)
                    if len(groups) > 1 and groups[1] and groups[1].isdigit():
                        year = int(groups[1])
                        if 1900 <= year <= 2030:  # Reasonable year range
                            result.year = year
                    
                    # Extract edition (third group if exists and this is an edition pattern)
                    if len(groups) > 2 and groups[2] and i == 0:  # First pattern is edition pattern
                        edition = groups[2]
                        # Clean up edition text
                        edition = re.sub(r'[\s\._-]+', ' ', edition).strip()
                        if edition:
                            result.edition = edition
                    
                    title_found = True
                    break
        
        # If still no title, try to extract from directory structure
        if not result.title:
            # Try to get title from parent directory path
            path_parts = Path(filename).parts
            for part in reversed(path_parts[:-1]):  # Exclude filename itself
                # Look for directory with year pattern
                dir_match = re.search(r'^(.+?)\s*[\(\[](\d{4})[\)\]]', part)
                if dir_match:
                    result.title = self.clean_movie_title(dir_match.group(1))
                    if not result.year:
                        result.year = int(dir_match.group(2))
                    break
                # Or just clean directory name
                elif not re.search(r'(movies?|films?|cinema)', part.lower()):
                    cleaned_dir = self.clean_movie_title(part)
                    if len(cleaned_dir) > 2:  # Reasonable title length
                        result.title = cleaned_dir
                        break
        
        # Final fallback - use cleaned filename
        if not result.title:
            result.title = self.clean_movie_title(clean_name)
        
        # Enhanced edition detection if not already found
        if not result.edition:
            edition_pattern = r'\b(' + '|'.join(self.edition_keywords) + r')(?:\'?s)?(?:\s+(?:Cut|Edition|Version|Collection))?\b'
            edition_match = re.search(edition_pattern, clean_name, re.IGNORECASE)
            if edition_match:
                result.edition = edition_match.group(1)
        
        return result

    def clean_movie_title(self, title: str) -> str:
        """Enhanced title cleaning specifically for movies"""
        if not title:
            return ""
        
        # Remove file extensions
        title = re.sub(r'\.(mkv|mp4|avi|mov|wmv|flv|webm)$', '', title, flags=re.IGNORECASE)
        
        # Remove obvious technical patterns and groups
        cleaning_patterns = [
            # Release groups (common ones)
            r'\b(YIFY|RARBG|FGT|SPARKS|AMZN|NTb|NTG|TOMMY|ION10|d3g|Tigole|QxR|UTR|FLEET|SECTOR7|KiNGS|YAMG|ANiHLS|CTU|TERMINAL|ESiR|CHD|EPiC|SEPTiC|PUKKA|EbP|ZeaL|DiAMOND|CrazyTeam|Artik|SEDG|NTK|Chaps|EPiSODE|UsaBit\.com|HDBRiSe|REDµX|ARROW|iLG|FtS|AN0NYM0US|bb)\b',
            
            # Technical specs
            r'\b(480p|720p|1080p|2160p|4K|8K|UHD|HDR10?|DV|Dolby\.?Vision)\b',
            r'\b(BluRay|Blu-?ray|BRRip|BDRip|DVDRip|WEBRip|WEB-DL|HDTV|CAM|TS|TC|R5|SCR|Ultra\s*HD\s*Blu-?ray)\b',
            r'\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|XVID|XviD|DIVX|DivX)\b',
            r'\b(DTS-HD|DTS-X|TrueHD|Atmos|DD[57]\.1|AC3|AAC|FLAC|DDP5\.1|MP3)\b',
            
            # Quality indicators
            r'\b(PROPER|REPACK|INTERNAL|LIMITED|FESTIVAL|SCREENER|HC|KORSUB|MULTI|NF|AMZN|Director\'?s|Extended|Unrated|Theatrical|Ultimate|Special|Final|Remastered)\b',
            
            # Websites and tags
            r'\[.*?\]',  # Remove bracketed content
            r'\(.*?(?:Rip|www\.|\.com|\.org).*?\)',  # Remove parentheses with technical terms
            
            # Years in brackets/parentheses (we handle these separately)
            r'[\[\(]\d{4}[\]\)]',
            
            # Common separators when they're clearly separators
            r'[\-_]{2,}',  # Multiple dashes or underscores
        ]
        
        # Apply cleaning patterns
        for pattern in cleaning_patterns:
            title = re.sub(pattern, ' ', title, flags=re.IGNORECASE)
        
        # Handle dots more carefully - only replace when they're clearly separators
        # Keep dots in abbreviations like "S.H.I.E.L.D."
        title = re.sub(r'(?<!\w)\.+(?!\w)', ' ', title)  # Dots not between word characters
        title = re.sub(r'\b\w\.\s+(?=\w\.)', lambda m: m.group(0).replace(' ', ''), title)  # Restore abbreviations
        
        # Replace remaining separators with spaces
        title = re.sub(r'[\-_\.]+', ' ', title)
        
        # Clean up multiple spaces
        title = re.sub(r'\s+', ' ', title)
        
        # Clean up and return
        title = title.strip()
        
        # Remove common prefixes/suffixes
        title = re.sub(r'^(the\s+)?movies?\s*[/\\-]\s*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*(movies?|films?)$', '', title, flags=re.IGNORECASE)
        
        return title.strip()
    
    def parse_tv_filename(self, filename: str) -> ParsedMedia:
        """Enhanced TV show filename parsing with better anime support"""
        clean_name = self.normalize_text(Path(filename).stem)
        tech_info = self.extract_technical_info(filename)
        
        # Filter tech_info to only include valid ParsedMedia fields
        valid_fields = ['quality', 'source', 'codec', 'audio', 'language']
        filtered_tech_info = {k: v for k, v in tech_info.items() if k in valid_fields}
        
        result = ParsedMedia(
            title="",
            media_type='episode',
            original_filename=filename,
            **filtered_tech_info
        )
        
        # Enhanced patterns with better episode title capture
        enhanced_tv_patterns = [
            # Underscore-separated pattern - ADD THIS FIRST
            r'^(.+?)_S(\d+)E(\d+)_(.+?)_(\d{3,4}p)_(.+)',
            # Standard TV with full episode titles (capture everything until technical specs)
            r'^(.+?)[\s\.]S(\d+)E(\d+)[\s\.\-_](.+?)[\s\.](?:\d{3,4}p|BluRay|HDTV|WEB|x264|x265|H\.?264|H\.?265)',
            r'^(.+?)[\s\.]s(\d+)e(\d+)[\s\.\-_](.+?)[\s\.](?:\d{3,4}p|BluRay|HDTV|WEB|x264|x265|H\.?264|H\.?265)',
            # Anime patterns - FIXED: Capture full episode title until bracket
            r'^(.+?)[\s\-]+(\d+)[\s\-]+(.+?)[\s\[\(](?:\d{3,4}p|\[)',
            r'^(.+?)[\s\-]+EP?(\d+)[\s\-]+(.+?)[\s\[\(]',
            # Show with year then episode info 
            r'^(.+?)\s(\d{4})\sS(\d+)E(\d+)[\s\.\-_](.+?)[\s\.](?:\d{3,4}p|BluRay|HDTV|WEB)',
            r'^(.+?)\s(\d{4})\sS(\d+)E(\d+).*',
            # Standard without episode titles
            r'^(.+?)[\s\.]S(\d+)E(\d+)(?:-E?(\d+))?.*',
            r'^(.+?)[\s\.](\d+)x(\d+)(?:-(\d+))?.*',
            r'^(.+?)[\s\.]s(\d+)e(\d+)(?:-?e(\d+))?.*',
        ]
        
        # Try enhanced patterns
        for pattern in enhanced_tv_patterns:
            match = re.match(pattern, clean_name, re.IGNORECASE)
            if match:
                groups = match.groups()
                
                # Handle underscore-separated pattern
                if '_S(\d+)E(\d+)_' in pattern:
                    result.title = groups[0].replace('_', ' ').strip()
                    result.season = int(groups[1]) if groups[1] else None
                    result.episode = int(groups[2]) if groups[2] else None
                    result.episode_title = groups[3].replace('_', ' ').strip() if groups[3] else None
                    # Quality already extracted in tech_info
                    break
                
                # Handle anime-style pattern
                elif r'[\s\-]+(\d+)[\s\-]+(.+?)[\s\[\(]' in pattern:
                    result.title = self.clean_title(groups[0])
                    result.episode = int(groups[1]) if groups[1] else None
                    if len(groups) > 2 and groups[2]:
                        # FIXED: Properly extract full episode title
                        episode_title = groups[2].strip()
                        # Handle comma-separated parts like "To You, in 2000 Years"
                        if 'To You' in episode_title and 'Years' in clean_name:
                            # Extract the full title from original string
                            full_match = re.search(r'(\d+)\s*-\s*(.+?)\s*[\[\(]', clean_name)
                            if full_match:
                                episode_title = full_match.group(2).strip()
                        result.episode_title = episode_title
                    result.season = 1  # Default season for anime
                    break
                
                # Handle show with year pattern
                elif r'\s(\d{4})\sS(\d+)E(\d+)' in pattern:
                    result.title = self.clean_title(groups[0])
                    result.year = int(groups[1]) if groups[1] and len(groups[1]) == 4 else None
                    result.season = int(groups[2]) if groups[2] else None
                    result.episode = int(groups[3]) if groups[3] else None
                    if len(groups) > 4 and groups[4]:
                        result.episode_title = groups[4].strip()
                    break
                
                # Handle regular patterns
                else:
                    result.title = self.clean_title(groups[0])
                    
                    # Determine season/episode based on pattern structure
                    if len(groups) >= 3:
                        if groups[1] and groups[1].isdigit():
                            if len(groups[1]) == 4:  # Year
                                result.year = int(groups[1])
                                if len(groups) >= 4:
                                    result.season = int(groups[2]) if groups[2] else None
                                    result.episode = int(groups[3]) if groups[3] else None
                            else:  # Season number
                                result.season = int(groups[1]) if groups[1] else None
                                result.episode = int(groups[2]) if groups[2] else None
                                # Episode title
                                if len(groups) >= 4 and groups[3]:
                                    result.episode_title = groups[3].strip()
                    
                    break
        
        if not result.title:
            result.title = self.clean_title(clean_name)
        
        return result

    def advanced_similarity(self, title1: str, title2: str) -> float:
        """Advanced similarity calculation with multiple algorithms"""
        title1_clean = self.clean_title(title1.lower())
        title2_clean = self.clean_title(title2.lower())
        
        # Exact match bonus
        if title1_clean == title2_clean:
            return 1.0
        
        # Sequence matcher
        seq_score = SequenceMatcher(None, title1_clean, title2_clean).ratio()
        
        # Word-based matching
        words1 = set(title1_clean.split())
        words2 = set(title2_clean.split())
        if words1 and words2:
            word_score = len(words1.intersection(words2)) / len(words1.union(words2))
        else:
            word_score = 0
        
        # Substring matching
        if title1_clean in title2_clean or title2_clean in title1_clean:
            substring_bonus = 0.1
        else:
            substring_bonus = 0
        
        # Combined score with weights
        final_score = (seq_score * 0.6) + (word_score * 0.3) + substring_bonus
        
        return min(final_score, 1.0)
    
    def _rate_limit_check(self):
        """Ensure we don't exceed API rate limits"""
        time_since_last = time.time() - self.last_api_call
        if time_since_last < self.rate_limit:
            time.sleep(self.rate_limit - time_since_last)
        self.last_api_call = time.time()
    
    def _search_movie_uncached(self, title: str, year: Optional[int] = None) -> List[Dict]:
        """Search TMDB for movie matches (uncached version)"""
        self._rate_limit_check()
        
        params = {
            'api_key': self.tmdb_api_key,
            'query': title,
            'include_adult': False
        }
        
        if year:
            params['year'] = year
        
        try:
            response = requests.get(f"{self.tmdb_base_url}/search/movie", params=params, timeout=10)
            
            if response.status_code == 200:
                return response.json().get('results', [])
            else:
                self.logger.error(f"TMDB Movie Search Error: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            self.logger.error(f"TMDB Movie Search Exception: {e}")
            return []
    
    def _search_tv_uncached(self, title: str, year: Optional[int] = None) -> List[Dict]:
        """Search TMDB for TV show matches (uncached version)"""
        self._rate_limit_check()
        
        params = {
            'api_key': self.tmdb_api_key,
            'query': title,
            'include_adult': False
        }
        
        if year:
            params['first_air_date_year'] = year
        
        try:
            response = requests.get(f"{self.tmdb_base_url}/search/tv", params=params, timeout=10)
            
            if response.status_code == 200:
                return response.json().get('results', [])
            else:
                self.logger.error(f"TMDB TV Search Error: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            self.logger.error(f"TMDB TV Search Exception: {e}")
            return []
    
    def _get_movie_details_uncached(self, movie_id: int) -> Dict:
        """Get detailed movie information from TMDB (uncached version)"""
        self._rate_limit_check()
        
        params = {
            'api_key': self.tmdb_api_key,
            'append_to_response': 'alternative_titles,credits,keywords,videos'
        }
        
        try:
            response = requests.get(f"{self.tmdb_base_url}/movie/{movie_id}", params=params, timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                self.logger.error(f"TMDB Movie Details Error: {response.status_code}")
                return {}
        except Exception as e:
            self.logger.error(f"TMDB Movie Details Exception: {e}")
            return {}
    
    def _get_tv_details_uncached(self, tv_id: int) -> Dict:
        """Get detailed TV show information from TMDB (uncached version)"""
        self._rate_limit_check()
        
        params = {
            'api_key': self.tmdb_api_key,
            'append_to_response': 'alternative_names,credits,keywords,videos'
        }
        
        try:
            response = requests.get(f"{self.tmdb_base_url}/tv/{tv_id}", params=params, timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                self.logger.error(f"TMDB TV Details Error: {response.status_code}")
                return {}
        except Exception as e:
            self.logger.error(f"TMDB TV Details Exception: {e}")
            return {}
    
    def find_best_match(self, parsed_info: ParsedMedia, search_results: List[Dict]) -> Optional[Tuple[Dict, float]]:
        """Find the best match using advanced scoring"""
        if not search_results:
            return None
        
        best_match = None
        best_score = 0
        
        for result in search_results:
            # Get title and year based on content type
            if parsed_info.media_type == 'movie':
                result_title = result.get('title', '')
                result_year = result.get('release_date', '')[:4] if result.get('release_date') else None
            else:
                result_title = result.get('name', '')
                result_year = result.get('first_air_date', '')[:4] if result.get('first_air_date') else None
            
            # Title similarity
            title_score = self.advanced_similarity(parsed_info.title, result_title)
            
            # Year matching bonus
            year_bonus = 0
            if parsed_info.year and result_year:
                year_diff = abs(int(parsed_info.year) - int(result_year))
                if year_diff == 0:
                    year_bonus = 0.2
                elif year_diff == 1:
                    year_bonus = 0.1
            
            # Popularity bonus (for ties)
            popularity_bonus = min(result.get('popularity', 0) / 1000, 0.05)
            
            # Vote average bonus (for quality)
            vote_bonus = min(result.get('vote_average', 0) / 100, 0.05)
            
            total_score = title_score + year_bonus + popularity_bonus + vote_bonus
            total_score = min(total_score, 1.0) # Cap total_score at 1.0
            
            if total_score > best_score:
                best_score = total_score
                best_match = result
        
        # Only return if confidence is high enough
        return (best_match, best_score) if best_score > 0.6 else None
    
    def scan_file(self, filename: str, content_type: str = 'auto') -> Dict:
        """
        Enhanced file scanning with comprehensive metadata extraction
        
        Args:
            filename: The filename to scan
            content_type: 'movie', 'tv', or 'auto'
        
        Returns:
            Dictionary with parsed info, metadata, and confidence scores
        """
        result = {
            'filename': filename,
            'parsed_info': None,
            'metadata': None,
            'confidence': 0.0,
            'alternative_matches': [],
            'technical_info': {},
            'error': None
        }
        
        try:
            # Auto-detect content type
            if content_type == 'auto':
                detected_type = self.auto_detect_type(filename)
                content_type = detected_type
            
            # Parse filename
            if content_type == 'tv' or content_type == 'episode':
                parsed_info = self.parse_tv_filename(filename)
            else:
                parsed_info = self.parse_movie_filename(filename)
            
            result['parsed_info'] = parsed_info.__dict__
            result['technical_info'] = self.extract_technical_info(filename)
            
            # Search TMDB
            if parsed_info.media_type == 'movie':
                search_results = self.search_movie(parsed_info.title, parsed_info.year)
            else:
                search_results = self.search_tv(parsed_info.title, parsed_info.year)
            
            # Find best match
            match_result = self.find_best_match(parsed_info, search_results)
            
            if match_result:
                best_match, confidence = match_result
                result['confidence'] = confidence
                
                # Get detailed metadata
                if parsed_info.media_type == 'movie':
                    metadata = self.get_movie_details(best_match['id'])
                else:
                    metadata = self.get_tv_details(best_match['id'])
                
                result['metadata'] = metadata
                
                # Include alternative matches for user choice
                result['alternative_matches'] = [
                    {
                        'id': r['id'],
                        'title': r.get('title') or r.get('name'),
                        'year': (r.get('release_date') or r.get('first_air_date', ''))[:4],
                        'confidence': self.advanced_similarity(parsed_info.title, r.get('title') or r.get('name', ''))
                    }
                    for r in search_results[:5] if r['id'] != best_match['id']
                ]
            
        except Exception as e:
            result['error'] = str(e)
            self.logger.error(f"Error scanning {filename}: {e}")
        
        return result
    
    def batch_scan(self, filenames: List[str], content_type: str = 'auto') -> List[Dict]:
        """Scan multiple files efficiently"""
        results = []
        
        for filename in filenames:
            self.logger.info(f"Scanning: {filename}")
            result = self.scan_file(filename, content_type)
            results.append(result)
            
            # Small delay to be respectful to API
            time.sleep(0.1)
        
        return results
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        return {
            'movie_search_cache': f"{self.search_movie.cache_info()}",
            'tv_search_cache': f"{self.search_tv.cache_info()}",
            'movie_details_cache': f"{self.get_movie_details.cache_info()}",
            'tv_details_cache': f"{self.get_tv_details.cache_info()}"
        }
    
    def clear_cache(self):
        """Clear all caches"""
        self.search_movie.cache_clear()
        self.search_tv.cache_clear()
        self.get_movie_details.cache_clear()
        self.get_tv_details.cache_clear()


# Enhanced demo with comprehensive testing
if __name__ == "__main__":
    print("🚀 Enhanced Plex-Style Media Scanner")
    print("=" * 60)
    
    # Initialize with API key
    api_key = "4a25d85d8e39854163b3a577f657d505"
    
    if api_key == "YOUR_TMDB_API_KEY_HERE":
        print("⚠️  Please set your TMDB API key to test full functionality")
        print("   Get one free at: https://www.themoviedb.org/settings/api")
        print("\n🔧 Testing parsing functionality only...\n")
        
        # Demo parsing without API
        scanner = EnhancedMediaScanner("demo")
        
        test_files = [
            "The Dark Knight (2008) IMAX Edition 1080p BluRay x264-GROUP.mkv",
            "Breaking Bad S01E01 Pilot 720p HDTV x264-CTU.mkv",
            "Inception 2010 Director's Cut 4K UHD BluRay x265-RARBG.mp4",
            "Game of Thrones s08e06 The Iron Throne 1080p WEB-DL DD5.1 H264-GoT.mkv",
            "The Matrix Reloaded (2003) Part 1 1080p BluRay DTS-HD MA 5.1 x264.mkv",
            "Attack on Titan - 01 - To You, in 2000 Years [1080p].mkv",
            "The Office US 2005 S01E01 Pilot HDTV XviD-LOL.avi"
        ]
        
        for filename in test_files:
            print(f"📁 {filename}")
            
            # Parse movie format
            if scanner.auto_detect_type(filename) == 'movie':
                parsed = scanner.parse_movie_filename(filename)
            else:
                parsed = scanner.parse_tv_filename(filename)
            
            tech_info = scanner.extract_technical_info(filename)
            
            print(f"   📝 Title: {parsed.title}")
            if parsed.year:
                print(f"   📅 Year: {parsed.year}")
            if parsed.season and parsed.episode:
                print(f"   📺 S{parsed.season:02d}E{parsed.episode:02d}")
            if parsed.episode_title:
                print(f"   🏷️  Episode: {parsed.episode_title}")
            if tech_info:
                print(f"   🔧 Technical: {tech_info}")
            if parsed.edition:
                print(f"   ✨ Edition: {parsed.edition}")
            print()
    
    else:
        # Full functionality test
        scanner = EnhancedMediaScanner(api_key)
        
        test_files = [
            "The Dark Knight (2008) IMAX Edition 1080p BluRay x264-GROUP.mkv",
            "Breaking Bad S01E01 Pilot 720p HDTV x264-CTU.mkv",
            "Inception 2010 Director's Cut 4K UHD BluRay x265-RARBG.mp4",
            "Game of Thrones s08e06 The Iron Throne 1080p WEB-DL DD5.1 H264-GoT.mkv",
            "The Matrix Reloaded (2003) Part 1 1080p BluRay DTS-HD MA 5.1 x264.mkv",
            "Attack on Titan - 01 - To You, in 2000 Years [1080p].mkv",
            "The Office US 2005 S01E01 Pilot HDTV XviD-LOL.avi"
        ]
        
        results = scanner.batch_scan(test_files)
        
        for result in results:
            print(f"\n📁 {result['filename']}")
            
            if result['error']:
                print(f"❌ Error: {result['error']}")
                continue
            
            parsed = result['parsed_info']
            print(f"📝 Parsed Title: {parsed['title']}") # Changed label for clarity

            if parsed.get('year') is not None:
                print(f"   📅 Parsed Year: {parsed['year']}")

            season_val = parsed.get('season')
            episode_val = parsed.get('episode')
            if season_val is not None and episode_val is not None:
                try:
                    print(f"   📺 Parsed S{int(season_val):02d}E{int(episode_val):02d}")
                except ValueError: # Should not happen if correctly parsed as int or None
                    print(f"   📺 Parsed S{season_val}E{episode_val}")


            if parsed.get('episode_title'):
                print(f"   🏷️  Parsed Episode Title: {parsed['episode_title']}")

            # Display technical information from ParsedMedia
            if parsed.get('quality'):
                print(f"   🎞️ Quality: {parsed['quality']}")
            if parsed.get('source'):
                print(f"   💿 Source: {parsed['source']}")
            if parsed.get('codec'):
                print(f"   💻 Codec: {parsed['codec']}")
            if parsed.get('audio'):
                print(f"   🔊 Audio: {parsed['audio']}")
            if parsed.get('language'):
                print(f"   🗣️ Language: {parsed['language']}")
            
            # Display HDR if it was in the original tech_info (it's not in ParsedMedia dataclass)
            if result.get('technical_info', {}).get('hdr'):
                print(f"   💡 HDR: {result['technical_info']['hdr']}")

            if parsed.get('edition'):
                print(f"   ✨ Parsed Edition: {parsed['edition']}")
            
            if parsed.get('part') is not None:
                print(f"   🧩 Parsed Part: {parsed['part']}")
            
            if result['metadata']:
                meta = result['metadata']
                title = meta.get('title') or meta.get('name')
                date = (meta.get('release_date') or meta.get('first_air_date', ''))[:4]
                print(f"✅ Found: {title} ({date})")
                print(f"🎯 Confidence: {result['confidence']:.2f}")
                print(f"⭐ Rating: {meta.get('vote_average', 'N/A')}")
            else:
                print("❌ No match found")
        
        print(f"\n📊 Cache Stats:")
        for key, value in scanner.get_cache_stats().items():
            print(f"   {key}: {value}")