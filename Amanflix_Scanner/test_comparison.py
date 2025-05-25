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
from guessit import guessit

# Import your existing scanner
from main import EnhancedMediaScanner, ParsedMedia

class GuessItComparison:
    """Class to compare custom scanner with GuessIt"""
    
    def __init__(self, tmdb_api_key: str):
        self.custom_scanner = EnhancedMediaScanner(tmdb_api_key)
        
    def parse_with_guessit(self, filename: str) -> ParsedMedia:
        """Parse filename using GuessIt library"""
        try:
            guessed = guessit(filename)
            
            # Convert GuessIt result to our ParsedMedia format
            result = ParsedMedia(
                title=str(guessed.get('title', '')),
                year=guessed.get('year'),
                season=guessed.get('season'),
                episode=guessed.get('episode'),
                episode_title=guessed.get('episode_title'),
                media_type='episode' if guessed.get('type') == 'episode' else 'movie',
                original_filename=filename
            )
            
            # Map GuessIt fields to our format
            if 'screen_size' in guessed:
                result.quality = str(guessed['screen_size'])
            elif 'source' in guessed and any(q in str(guessed['source']).upper() for q in ['4K', 'UHD', '1080P', '720P']):
                result.quality = str(guessed['source'])
            
            if 'source' in guessed:
                result.source = str(guessed['source'])
            
            if 'video_codec' in guessed:
                result.codec = str(guessed['video_codec'])
            
            if 'audio_codec' in guessed:
                result.audio = str(guessed['audio_codec'])
            elif 'audio_channels' in guessed:
                result.audio = str(guessed['audio_channels'])
            
            if 'language' in guessed:
                result.language = str(guessed['language'])
            
            if 'edition' in guessed:
                result.edition = str(guessed['edition'])
            
            if 'part' in guessed:
                result.part = guessed['part']
            
            return result
            
        except Exception as e:
            print(f"GuessIt parsing error for {filename}: {e}")
            return ParsedMedia(title="", original_filename=filename)

    def compare_parsing_results(self, custom_result: ParsedMedia, guessit_result: ParsedMedia) -> Dict:
        """Compare custom parsing results with GuessIt results"""
        comparison = {
            'agreement': {},
            'differences': {},
            'confidence_scores': {},
            'recommended': {}
        }
        
        fields_to_compare = ['title', 'year', 'season', 'episode', 'episode_title', 
                           'media_type', 'quality', 'source', 'codec', 'audio', 
                           'language', 'edition', 'part']
        
        for field in fields_to_compare:
            custom_val = getattr(custom_result, field)
            guessit_val = getattr(guessit_result, field)
            
            # Normalize for comparison
            custom_normalized = str(custom_val).lower().strip() if custom_val is not None else None
            guessit_normalized = str(guessit_val).lower().strip() if guessit_val is not None else None
            
            if custom_normalized == guessit_normalized:
                comparison['agreement'][field] = custom_val
            else:
                comparison['differences'][field] = {
                    'custom': custom_val,
                    'guessit': guessit_val
                }
                
                # Calculate confidence for title field
                if field == 'title' and custom_val and guessit_val:
                    similarity = self.custom_scanner.advanced_similarity(str(custom_val), str(guessit_val))
                    comparison['confidence_scores'][field] = similarity
                    
                    # Recommend based on similarity and other factors
                    if similarity > 0.8:
                        comparison['recommended'][field] = custom_val  # Prefer custom if very similar
                    elif len(str(custom_val)) > len(str(guessit_val)) * 1.5:
                        comparison['recommended'][field] = guessit_val  # GuessIt might be cleaner
                    else:
                        comparison['recommended'][field] = custom_val
                else:
                    # For non-title fields, prefer the one that has a value
                    if custom_val and not guessit_val:
                        comparison['recommended'][field] = custom_val
                    elif guessit_val and not custom_val:
                        comparison['recommended'][field] = guessit_val
                    elif custom_val and guessit_val:
                        # Both have values, prefer custom for technical fields, GuessIt for metadata
                        if field in ['quality', 'source', 'codec', 'audio']:
                            comparison['recommended'][field] = custom_val
                        else:
                            comparison['recommended'][field] = guessit_val
        
        return comparison

    def test_single_file(self, filename: str, show_raw_guessit: bool = False) -> Dict:
        """Test a single file with both parsers"""
        print(f"\n{'='*80}")
        print(f"📁 TESTING: {filename}")
        print('='*80)
        
        # Parse with custom scanner
        if self.custom_scanner.auto_detect_type(filename) == 'movie':
            custom_result = self.custom_scanner.parse_movie_filename(filename)
        else:
            custom_result = self.custom_scanner.parse_tv_filename(filename)
        
        # Parse with GuessIt
        guessit_result = self.parse_with_guessit(filename)
        
        # Show raw GuessIt output if requested
        if show_raw_guessit:
            print(f"\n🔍 Raw GuessIt Output:")
            guessed_raw = guessit(filename)
            for key, value in guessed_raw.items():
                print(f"   {key}: {value}")
        
        # Compare results
        comparison = self.compare_parsing_results(custom_result, guessit_result)
        
        # Display results
        print(f"\n📋 CUSTOM SCANNER RESULTS:")
        self._display_parsed_media(custom_result)
        
        print(f"\n📋 GUESSIT RESULTS:")
        self._display_parsed_media(guessit_result)
        
        print(f"\n✅ AGREEMENTS:")
        for field, value in comparison['agreement'].items():
            if value is not None:
                print(f"   {field}: {value}")
        
        print(f"\n❌ DIFFERENCES:")
        for field, values in comparison['differences'].items():
            print(f"   {field}:")
            print(f"      Custom:  {values['custom']}")
            print(f"      GuessIt: {values['guessit']}")
            if field in comparison['recommended']:
                print(f"      🎯 Recommended: {comparison['recommended'][field]}")
        
        if comparison['confidence_scores']:
            print(f"\n📊 CONFIDENCE SCORES:")
            for field, score in comparison['confidence_scores'].items():
                print(f"   {field}: {score:.3f}")
        
        return {
            'filename': filename,
            'custom_result': custom_result,
            'guessit_result': guessit_result,
            'comparison': comparison
        }
    
    def _display_parsed_media(self, parsed: ParsedMedia):
        """Display parsed media information in a formatted way"""
        print(f"   📝 Title: {parsed.title}")
        if parsed.year:
            print(f"   📅 Year: {parsed.year}")
        if parsed.season is not None and parsed.episode is not None:
            print(f"   📺 S{parsed.season:02d}E{parsed.episode:02d}")
        if parsed.episode_title:
            print(f"   🏷️  Episode Title: {parsed.episode_title}")
        if parsed.quality:
            print(f"   🎞️ Quality: {parsed.quality}")
        if parsed.source:
            print(f"   💿 Source: {parsed.source}")
        if parsed.codec:
            print(f"   💻 Codec: {parsed.codec}")
        if parsed.audio:
            print(f"   🔊 Audio: {parsed.audio}")
        if parsed.language:
            print(f"   🗣️ Language: {parsed.language}")
        if parsed.edition:
            print(f"   ✨ Edition: {parsed.edition}")
        if parsed.part is not None:
            print(f"   🧩 Part: {parsed.part}")
        print(f"   📂 Media Type: {parsed.media_type}")

    def batch_test(self, filenames: List[str], show_raw_guessit: bool = False) -> List[Dict]:
        """Test multiple files and return summary statistics"""
        results = []
        
        for filename in filenames:
            result = self.test_single_file(filename, show_raw_guessit)
            results.append(result)
        
        # Generate summary statistics
        self._generate_summary(results)
        
        return results
    
    def _generate_summary(self, results: List[Dict]):
        """Generate summary statistics from test results"""
        print(f"\n{'='*80}")
        print("📊 SUMMARY STATISTICS")
        print('='*80)
        
        total_files = len(results)
        agreement_counts = {}
        difference_counts = {}
        
        for result in results:
            comparison = result['comparison']
            
            for field in comparison['agreement']:
                agreement_counts[field] = agreement_counts.get(field, 0) + 1
            
            for field in comparison['differences']:
                difference_counts[field] = difference_counts.get(field, 0) + 1
        
        print(f"\n✅ Agreement Rates:")
        all_fields = set(list(agreement_counts.keys()) + list(difference_counts.keys()))
        for field in sorted(all_fields):
            agreements = agreement_counts.get(field, 0)
            total_with_field = agreements + difference_counts.get(field, 0)
            if total_with_field > 0:
                rate = agreements / total_with_field * 100
                print(f"   {field:15s}: {agreements:2d}/{total_with_field:2d} ({rate:5.1f}%)")
        
        print(f"\n📈 Most Common Differences:")
        sorted_diffs = sorted(difference_counts.items(), key=lambda x: x[1], reverse=True)
        for field, count in sorted_diffs[:5]:
            print(f"   {field:15s}: {count} files")
    
    def calculate_success_rates(self, results):
        """Calculate success rates for both scanners"""
        total_files = len(results)
        if total_files == 0:
            return {"custom": 0, "guessit": 0, "perfect_matches": 0}
        
        perfect_matches = 0
        custom_successes = 0
        guessit_successes = 0
        
        # Critical fields that must be correct for a "success"
        critical_fields = ['title', 'year', 'season', 'episode', 'media_type']
        
        for result in results:
            custom_result = result['custom_result']
            guessit_result = result['guessit_result']
            comparison = result['comparison']
            
            # Check if it's a perfect match (no differences)
            if not comparison.get('differences', {}):
                perfect_matches += 1
            
            # Count as success if all critical fields are reasonably correct
            # This is based on whether the parser extracted meaningful information
            
            # Custom scanner success criteria - FIXED: Use attribute access instead of .get()
            custom_success = True
            if not custom_result.title or len(custom_result.title.strip()) < 2:
                custom_success = False
            if custom_result.media_type == 'episode':
                if not custom_result.season or not custom_result.episode:
                    custom_success = False
            
            # GuessIt success criteria - FIXED: Use attribute access instead of .get()
            guessit_success = True
            if not guessit_result.title or len(guessit_result.title.strip()) < 2:
                guessit_success = False
            if guessit_result.media_type == 'episode':
                if not guessit_result.season or not guessit_result.episode:
                    guessit_success = False
            
            if custom_success:
                custom_successes += 1
            if guessit_success:
                guessit_successes += 1
        
        return {
            "custom": round((custom_successes / total_files) * 100, 1),
            "guessit": round((guessit_successes / total_files) * 100, 1),
            "perfect_matches": round((perfect_matches / total_files) * 100, 1),
            "total_files": total_files
        }

    def generate_summary(self, results):
        """Generate comprehensive comparison summary with success rates"""
        total_files = len(results)
        perfect_matches = 0
        files_with_differences = 0
        
        # Calculate success rates
        success_rates = self.calculate_success_rates(results)
        
        for result in results:
            differences = result['comparison'].get('differences', {})
            
            if not differences:
                perfect_matches += 1
            else:
                files_with_differences += 1
    
        # Generate summary
        summary = f"""
🎯 COMPARISON SUMMARY
{'='*60}

📊 SUCCESS RATES:
   Custom Scanner:    {success_rates['custom']}% ({int(success_rates['custom'] * total_files / 100)}/{total_files} files)
   GuessIt:          {success_rates['guessit']}% ({int(success_rates['guessit'] * total_files / 100)}/{total_files} files)
   Perfect Matches:   {success_rates['perfect_matches']}% ({perfect_matches}/{total_files} files)

📈 PERFORMANCE METRICS:
   Total Files Tested: {total_files}
   Files with Perfect Agreement: {perfect_matches} ({perfect_matches/total_files*100:.1f}%)
   Files with Differences: {files_with_differences} ({files_with_differences/total_files*100:.1f}%)
"""
    
        # Overall assessment
        if success_rates['custom'] > success_rates['guessit']:
            winner = "🥇 Custom Scanner"
            margin = success_rates['custom'] - success_rates['guessit']
        elif success_rates['guessit'] > success_rates['custom']:
            winner = "🥇 GuessIt"
            margin = success_rates['guessit'] - success_rates['custom']
        else:
            winner = "🤝 Tie"
            margin = 0
        
        summary += f"""

🎉 FINAL VERDICT:
   Winner: {winner}
   {'Margin: +' + str(margin) + '% success rate' if margin > 0 else ''}
   
   🔍 Key Insights:
   • Your custom scanner achieves {success_rates['custom']}% success rate
   • Perfect agreement on {success_rates['perfect_matches']}% of files
   • {'Custom scanner outperforms GuessIt' if success_rates['custom'] > success_rates['guessit'] else 'Performance is competitive with GuessIt'}
   
✨ RECOMMENDATION:
   {'🚀 Excellent! Your scanner is ready for production.' if success_rates['custom'] >= 90 else '🔧 Consider improvements for edge cases.' if success_rates['custom'] >= 80 else '⚠️ Significant improvements needed.'}
"""
    
        return summary

    def _is_better_value(self, custom_val, guessit_val):
        """Determine if custom value is better than guessit value"""
        # Convert to strings for comparison
        custom_str = str(custom_val) if custom_val is not None else ''
        guessit_str = str(guessit_val) if guessit_val is not None else ''
        
        # If one is None/empty and other isn't, the non-empty wins
        if not custom_str and guessit_str:
            return False
        if custom_str and not guessit_str:
            return True
        
        # Prefer more specific values
        preference_map = {
            # Source preferences (more specific wins)
            'WEB-DL': 3, 'WEBRip': 2, 'Web': 1,
            'Blu-ray': 3, 'BluRay': 2, 'Ultra HD Blu-ray': 4,
            'UHD': 2,
            
            # Audio preferences (more descriptive wins)
            'Dolby Atmos': 4, 'Atmos': 3,
            'Dolby Digital 5.1': 3, 'Dolby Digital': 2, 'DD5.1': 2,
            'Dolby Digital Plus 5.1': 4, 'Dolby Digital Plus': 3, 'DDP5.1': 2,
            
            # Edition preferences (more complete wins)
            'IMAX Edition': 3, 'IMAX': 2,
            'Extended Edition': 3, 'Extended': 2,
            'Director\'s Cut': 3, 'Director': 2,
        }
        
        custom_score = preference_map.get(custom_str, 1)
        guessit_score = preference_map.get(guessit_str, 1)
        
        return custom_score >= guessit_score

def main():
    """Run the comparison test"""
    # Test files
    test_files = [
        "The Dark Knight (2008) IMAX Edition 1080p BluRay x264-GROUP.mkv",
        "Inception 2010 Director's Cut 4K UHD BluRay x265-RARBG.mp4",
        "The Matrix Reloaded (2003) Part 1 1080p BluRay DTS-HD MA 5.1 x264.mkv",
        "Avengers Endgame (2019) 2160p UHD BluRay x265 HDR Atmos-TERMINAL.mkv",
        "Joker.2019.1080p.WEBRip.x264-RARBG.mp4",
        "Breaking Bad S01E01 Pilot 720p HDTV x264-CTU.mkv",
        "Game of Thrones s08e06 The Iron Throne 1080p WEB-DL DD5.1 H264-GoT.mkv",
        "The Office US 2005 S01E01 Pilot HDTV XviD-LOL.avi",
        "Stranger Things S04E01 The Hellfire Club 2160p NF WEBRip x265 HDR DDP5.1 Atmos.mkv",
        "Attack on Titan - 01 - To You, in 2000 Years [1080p].mkv",
        "Death Note S01E01 Rebirth 720p BluRay x264-ANiHLS.mkv",
        "Demon Slayer - Kimetsu no Yaiba - 01 - Cruelty [1080p].mkv",
        "The Lord of the Rings The Fellowship of the Ring (2001) Extended Edition 1080p BluRay x264-SECTOR7.mkv",
        "Marvel's Agents of S.H.I.E.L.D. S07E13 What We're Fighting For 1080p AMZN WEB-DL DDP5.1 H.264-KiNGS.mkv",
        "Star Wars Episode IV A New Hope (1977) Despecialized Edition v2.7 1080p.mkv",
        "Movie.Title.With.Dots.2020.1080p.BluRay.x264-GROUP.mkv",
        "Show_Name_S01E01_Episode_Title_1080p_WEB-DL.mkv",
        "Japanese.Movie.Name.2019.JAP.1080p.BluRay.x264-YAMG.mkv"
    ]
    
    print("🔄 Starting Enhanced Comparison Test...")
    print(f"📁 Testing {len(test_files)} files\n")
    
    # Run comparison - FIXED: Use correct class name
    comparison_tool = GuessItComparison("your_tmdb_api_key_here")  # Replace with your actual API key
    results = comparison_tool.batch_test(test_files, show_raw_guessit=True)
    
    # Save results - ADD missing method
    save_results(results, 'comparison_results.json')
    
    # Generate and display summary
    summary = comparison_tool.generate_summary(results)
    print(summary)
    
    # Calculate and display success rates
    success_rates = comparison_tool.calculate_success_rates(results)
    print(f"\n📊 DETAILED SUCCESS RATE BREAKDOWN:")
    print(f"   Custom Scanner Success Rate: {success_rates['custom']}%")
    print(f"   GuessIt Success Rate: {success_rates['guessit']}%")
    print(f"   Perfect Match Rate: {success_rates['perfect_matches']}%")
    
    print(f"\n💾 Results saved to: comparison_results.json")
    print(f"🎯 Test completed successfully!")

def save_results(results: List[Dict], filename: str):
    """Save comparison results to JSON file"""
    # Convert ParsedMedia objects to dictionaries for JSON serialization
    serializable_results = []
    
    for result in results:
        serializable_result = {
            'filename': result['filename'],
            'custom_result': {
                'title': result['custom_result'].title,
                'year': result['custom_result'].year,
                'season': result['custom_result'].season,
                'episode': result['custom_result'].episode,
                'episode_title': result['custom_result'].episode_title,
                'media_type': result['custom_result'].media_type,
                'quality': result['custom_result'].quality,
                'source': result['custom_result'].source,
                'codec': result['custom_result'].codec,
                'audio': result['custom_result'].audio,
                'language': result['custom_result'].language,
                'edition': result['custom_result'].edition,
                'part': result['custom_result'].part,
                'confidence': result['custom_result'].confidence,
                'original_filename': result['custom_result'].original_filename
            },
            'guessit_result': {
                'title': result['guessit_result'].title,
                'year': result['guessit_result'].year,
                'season': result['guessit_result'].season,
                'episode': result['guessit_result'].episode,
                'episode_title': result['guessit_result'].episode_title,
                'media_type': result['guessit_result'].media_type,
                'quality': result['guessit_result'].quality,
                'source': result['guessit_result'].source,
                'codec': result['guessit_result'].codec,
                'audio': result['guessit_result'].audio,
                'language': result['guessit_result'].language,
                'edition': result['guessit_result'].edition,
                'part': result['guessit_result'].part,
                'confidence': result['guessit_result'].confidence,
                'original_filename': result['guessit_result'].original_filename
            },
            'comparison': result['comparison']
        }
        serializable_results.append(serializable_result)
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(serializable_results, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()