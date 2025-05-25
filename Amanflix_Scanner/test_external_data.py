import yaml
import os
import json
import time
import logging
from pathlib import Path
from typing import Dict, Any, List
from difflib import SequenceMatcher

# Import your existing scanner
from main import EnhancedMediaScanner, ParsedMedia
import guessit

class ExternalDataComparison:
    """Class to compare custom scanner with GuessIt using external YAML test files"""
    
    def __init__(self, tmdb_api_key: str, test_files_dir: str = "/Users/almogcohen/Downloads"):
        self.custom_scanner = EnhancedMediaScanner(tmdb_api_key)
        self.test_files_dir = Path(test_files_dir)
        self.movies_file = self.test_files_dir / "movies (1).yml"
        self.episodes_file = self.test_files_dir / "episodes (1).yml"
        self.test_data = {}
        
    def load_test_files(self) -> Dict[str, Any]:
        """Load both movies and episodes test files"""
        print("🔄 Loading GuessIt test files...")
        
        # Load movies
        if self.movies_file.exists():
            with open(self.movies_file, 'r', encoding='utf-8') as f:
                movies_data = yaml.safe_load(f)
                self.test_data['movies'] = movies_data
                movie_count = len([k for k in movies_data.keys() if k != '__default__'])
                print(f"✅ Loaded {movie_count} movie test cases")
        else:
            print(f"❌ Movies file not found: {self.movies_file}")
            
        # Load episodes
        if self.episodes_file.exists():
            with open(self.episodes_file, 'r', encoding='utf-8') as f:
                episodes_data = yaml.safe_load(f)
                self.test_data['episodes'] = episodes_data
                episode_count = len([k for k in episodes_data.keys() if k != '__default__'])
                print(f"✅ Loaded {episode_count} episode test cases")
        else:
            print(f"❌ Episodes file not found: {self.episodes_file}")
            
        return self.test_data
    
    def get_sample_tests(self, category: str = "both", sample_size: int = 100) -> List[Dict[str, Any]]:
        """Get a sample of test cases for testing"""
        sample_tests = []
        
        if category in ["both", "movies"] and "movies" in self.test_data:
            movies_items = [(k, v) for k, v in self.test_data["movies"].items() if k != "__default__"]
            
            # If sample_size is -1, load all movies
            if sample_size == -1:
                movie_sample = movies_items
            else:
                movie_sample = movies_items[:sample_size//2 if category == "both" else sample_size]
            
            for filename, expected in movie_sample:
                sample_tests.append({
                    "filename": filename,
                    "expected": expected,
                    "type": "movie"
                })
        
        if category in ["both", "episodes"] and "episodes" in self.test_data:
            episodes_items = [(k, v) for k, v in self.test_data["episodes"].items() if k != "__default__"]
            
            # If sample_size is -1, load all episodes
            if sample_size == -1:
                episode_sample = episodes_items
            else:
                episode_sample = episodes_items[:sample_size//2 if category == "both" else sample_size]
            
            for filename, expected in episode_sample:
                sample_tests.append({
                    "filename": filename,
                    "expected": expected,
                    "type": "episode"
                })
        
        return sample_tests
    
    def parse_with_guessit(self, filename: str) -> ParsedMedia:
        """Parse filename using GuessIt library"""
        try:
            guessed = guessit.guessit(filename)
            
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

    def compare_parsing_results(self, custom_result: ParsedMedia, guessit_result: ParsedMedia, expected: Dict) -> Dict:
        """Compare custom and GuessIt results with expected values"""
        comparison = {
            'agreement': {},
            'differences': {},
            'confidence_scores': {},
            'recommended': {}
        }
        
        # Field mapping from expected format to our format
        field_mapping = {
            'title': 'title',
            'year': 'year',
            'season': 'season',
            'episode': 'episode',
            'episode_title': 'episode_title',
            'type': 'media_type',
            'screen_size': 'quality',
            'source': 'source',
            'video_codec': 'codec',
            'audio_codec': 'audio',
            'language': 'language',
            'edition': 'edition',
            'part': 'part'
        }
        
        for expected_field, our_field in field_mapping.items():
            if expected_field in expected:
                expected_val = expected[expected_field]
                custom_val = getattr(custom_result, our_field)
                guessit_val = getattr(guessit_result, our_field)
                
                # Normalize for comparison
                expected_normalized = self._normalize_value(expected_val)
                custom_normalized = self._normalize_value(custom_val)
                guessit_normalized = self._normalize_value(guessit_val)
                
                # Check agreement with expected
                custom_matches_expected = self._values_match(custom_normalized, expected_normalized)
                guessit_matches_expected = self._values_match(guessit_normalized, expected_normalized)
                
                if custom_matches_expected and guessit_matches_expected:
                    comparison['agreement'][our_field] = custom_val
                elif custom_matches_expected or guessit_matches_expected:
                    comparison['differences'][our_field] = {
                        'custom': custom_val,
                        'guessit': guessit_val,
                        'expected': expected_val
                    }
                    # Recommend the one that matches expected
                    if custom_matches_expected:
                        comparison['recommended'][our_field] = custom_val
                    else:
                        comparison['recommended'][our_field] = guessit_val
                else:
                    # Neither matches expected
                    comparison['differences'][our_field] = {
                        'custom': custom_val,
                        'guessit': guessit_val,
                        'expected': expected_val
                    }
                    
                    # Calculate similarity for title field
                    if our_field == 'title' and expected_val:
                        custom_similarity = self._calculate_similarity(str(custom_val), str(expected_val)) if custom_val else 0
                        guessit_similarity = self._calculate_similarity(str(guessit_val), str(expected_val)) if guessit_val else 0
                        
                        comparison['confidence_scores'][our_field] = {
                            'custom': custom_similarity,
                            'guessit': guessit_similarity
                        }
                        
                        # Recommend the one with higher similarity
                        if custom_similarity > guessit_similarity:
                            comparison['recommended'][our_field] = custom_val
                        else:
                            comparison['recommended'][our_field] = guessit_val
        
        return comparison

    def _normalize_value(self, value):
        """Normalize value for comparison"""
        if value is None:
            return None
        return str(value).lower().strip()

    def _values_match(self, actual, expected) -> bool:
        """Check if two values match with normalization"""
        if actual is None and expected is None:
            return True
        if actual is None or expected is None:
            return False
            
        # Special cases for common variations
        normalizations = {
            'tv': 'episode',
            'movie': 'movie',
            'h.264': 'h264',
            'x264': 'h264', 
            'h.265': 'h265',
            'x265': 'h265',
            'xvid': 'xvid'
        }
        
        actual_normalized = normalizations.get(actual, actual)
        expected_normalized = normalizations.get(expected, expected)
        
        return actual_normalized == expected_normalized

    def _calculate_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity between two strings"""
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    def test_single_file(self, test_case: Dict, show_raw_guessit: bool = False, show_details: bool = True) -> Dict:
        """Test a single file with both parsers - optionally show detailed format"""
        filename = test_case["filename"]
        expected = test_case["expected"]
        file_type = test_case["type"]
        
        # Parse with custom scanner
        if self.custom_scanner.auto_detect_type(filename) == 'movie':
            custom_result = self.custom_scanner.parse_movie_filename(filename)
        else:
            custom_result = self.custom_scanner.parse_tv_filename(filename)
        
        # Parse with GuessIt
        guessit_result = self.parse_with_guessit(filename)
        
        # Compare results
        comparison = self.compare_parsing_results(custom_result, guessit_result, expected)
        
        # Only show detailed output if requested
        if show_details:
            print(f"\n{'='*80}")
            print(f"📁 TESTING: {filename}")
            print('='*80)
            
            # Show raw GuessIt output if requested
            if show_raw_guessit:
                print(f"\n🔍 Raw GuessIt Output:")
                guessed_raw = guessit.guessit(filename)
                for key, value in guessed_raw.items():
                    print(f"   {key}: {value}")
            
            # Display results in detailed format
            print(f"\n📋 CUSTOM SCANNER RESULTS:")
            self._display_parsed_media_detailed(custom_result)
            
            print(f"\n📋 GUESSIT RESULTS:")
            self._display_parsed_media_detailed(guessit_result)
            
            print(f"\n✅ AGREEMENTS:")
            for field, value in comparison['agreement'].items():
                if value is not None:
                    print(f"   {field}: {value}")
            
            if comparison['differences']:
                print(f"\n❌ DIFFERENCES:")
                for field, values in comparison['differences'].items():
                    print(f"   {field}:")
                    print(f"      Custom:  {values['custom']}")
                    print(f"      GuessIt: {values['guessit']}")
                    if 'expected' in values:
                        print(f"      Expected: {values['expected']}")
                    if field in comparison['recommended']:
                        print(f"      🎯 Recommended: {comparison['recommended'][field]}")
            
            if comparison['confidence_scores']:
                print(f"\n📊 CONFIDENCE SCORES:")
                for field, scores in comparison['confidence_scores'].items():
                    if isinstance(scores, dict):
                        print(f"   {field}:")
                        print(f"      Custom vs Expected:  {scores['custom']:.3f}")
                        print(f"      GuessIt vs Expected: {scores['guessit']:.3f}")
                    else:
                        print(f"   {field}: {scores:.3f}")
        
        # Calculate failure score for ranking worst cases
        failure_score = self._calculate_failure_score(custom_result, guessit_result, expected)
        
        return {
            'filename': filename,
            'custom_result': custom_result,
            'guessit_result': guessit_result,
            'expected_result': expected,
            'comparison': comparison,
            'type': file_type,
            'failure_score': failure_score,
            'show_details': show_details
        }

    def _calculate_failure_score(self, custom_result: ParsedMedia, guessit_result: ParsedMedia, expected: Dict) -> float:
        """Calculate a failure score to rank worst performing files"""
        score = 0.0
        
        # Higher score = worse performance
        custom_success = self._is_successful_parse(custom_result, expected)
        guessit_success = self._is_successful_parse(guessit_result, expected)
        
        if not custom_success and guessit_success:
            score += 10.0  # Custom fails but GuessIt succeeds - worst case
        elif not custom_success and not guessit_success:
            score += 5.0   # Both fail - bad but not as critical
        elif custom_success and not guessit_success:
            score += 1.0   # Custom succeeds but GuessIt fails - less important
        
        # Add penalty for title similarity issues
        if 'title' in expected and custom_result.title:
            title_similarity = self._calculate_similarity(custom_result.title, expected['title'])
            score += (1.0 - title_similarity) * 3.0  # Up to 3 points for poor title matching
        
        return score

    def batch_test(self, test_cases: List[Dict], show_raw_guessit: bool = False) -> List[Dict]:
        """Test multiple files and return results, showing only worst 5 cases"""
        results = []
        total_cases = len(test_cases)
        
        print(f"\n🔄 Processing {total_cases} files silently...")
        print("📊 Will show detailed analysis for 5 worst cases at the end")
        print("=" * 60)
        
        # Process all files silently first
        for i, test_case in enumerate(test_cases):
            try:
                # Process without showing details
                result = self.test_single_file(test_case, show_raw_guessit, show_details=False)
                results.append(result)
                
                # Simple progress indicator
                if (i + 1) % 25 == 0 or (i + 1) == total_cases:
                    success_rate = len([r for r in results if 'error' not in r and 
                                     self._is_successful_parse(r['custom_result'], r['expected_result'])]) / len(results) * 100
                    print(f"📊 {i + 1}/{total_cases} processed | Success rate: {success_rate:.1f}%")
                    
            except Exception as e:
                print(f"❌ Error: {test_case['filename']}")
                results.append({
                    'filename': test_case['filename'],
                    'error': str(e),
                    'type': test_case['type'],
                    'failure_score': 100.0  # Highest failure score for errors
                })
        
        print(f"\n✅ Silent processing complete!")
        
        # Find the 5 worst cases
        valid_results = [r for r in results if 'error' not in r]
        worst_cases = sorted(valid_results, key=lambda x: x['failure_score'], reverse=True)[:5]
        
        if worst_cases:
            print(f"\n🔍 SHOWING 5 WORST PERFORMING FILES:")
            print("=" * 80)
            
            for i, worst_case in enumerate(worst_cases, 1):
                print(f"\n🚨 WORST CASE #{i} (Score: {worst_case['failure_score']:.1f})")
                
                # Reconstruct test case for detailed display
                test_case = {
                    'filename': worst_case['filename'],
                    'expected': worst_case['expected_result'],
                    'type': worst_case['type']
                }
                
                # Show detailed analysis for this case
                self.test_single_file(test_case, show_raw_guessit, show_details=True)
        
        return results

    def calculate_success_rates(self, results):
        """Calculate success rates for both scanners against expected results"""
        total_files = len(results)
        if total_files == 0:
            return {"custom": 0, "guessit": 0, "perfect_matches": 0, "perfect_count": 0}
        
        perfect_matches = 0
        custom_successes = 0
        guessit_successes = 0
        
        for result in results:
            if 'error' in result:
                continue
                
            comparison = result['comparison']
            
            # Check if it's a perfect match (no differences)
            if not comparison.get('differences', {}):
                perfect_matches += 1
            
            # Count success based on critical field accuracy
            custom_success = self._is_successful_parse(result['custom_result'], result['expected_result'])
            guessit_success = self._is_successful_parse(result['guessit_result'], result['expected_result'])
            
            if custom_success:
                custom_successes += 1
            if guessit_success:
                guessit_successes += 1
        
        return {
            "custom": round((custom_successes / total_files) * 100, 1),
            "guessit": round((guessit_successes / total_files) * 100, 1),
            "perfect_matches": round((perfect_matches / total_files) * 100, 1),
            "total_files": total_files,
            "perfect_count": perfect_matches
        }

    def _is_successful_parse(self, parsed_result: ParsedMedia, expected: Dict) -> bool:
        """Determine if a parse result is successful based on critical fields"""
        # Check title
        if 'title' in expected:
            if not parsed_result.title or len(parsed_result.title.strip()) < 2:
                return False
            # Check if title is reasonably similar
            similarity = self._calculate_similarity(parsed_result.title, expected['title'])
            if similarity < 0.6:  # 60% similarity threshold
                return False
        
        # Check season/episode for TV shows
        if expected.get('type') == 'episode' or 'season' in expected:
            if 'season' in expected and parsed_result.season != expected['season']:
                return False
            if 'episode' in expected and parsed_result.episode != expected['episode']:
                return False
        
        # Check year if present
        if 'year' in expected and expected['year']:
            if parsed_result.year != expected['year']:
                return False
        
        return True

    def _display_parsed_media_detailed(self, parsed: ParsedMedia):
        """Display parsed media information with emojis and formatting"""
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

    def _display_parsed_media(self, parsed: ParsedMedia):
        """Display only critical parsed media information"""
        print(f"   Title: {parsed.title}")
        if parsed.season is not None and parsed.episode is not None:
            print(f"   S{parsed.season:02d}E{parsed.episode:02d}")
        if parsed.year:
            print(f"   Year: {parsed.year}")

    def generate_summary(self, results):
        """Generate streamlined comparison summary"""
        total_files = len(results)
        error_count = len([r for r in results if 'error' in r])
        valid_results = [r for r in results if 'error' not in r]
        
        # Calculate success rates
        success_rates = self.calculate_success_rates(results)
        
        # Find only the worst failures
        worst_failures = []
        for result in valid_results:
            if not self._is_successful_parse(result['custom_result'], result['expected_result']):
                # Only include if GuessIt succeeded where custom failed
                if self._is_successful_parse(result['guessit_result'], result['expected_result']):
                    worst_failures.append(result['filename'])
        
        # Generate concise summary
        summary = f"""

🎯 EXTERNAL DATA TEST SUMMARY
{'='*50}

📊 SUCCESS RATES:
   Custom Scanner: {success_rates['custom']}% ({int(success_rates['custom'] * total_files / 100)}/{total_files})
   GuessIt:       {success_rates['guessit']}% ({int(success_rates['guessit'] * total_files / 100)}/{total_files})
   Perfect Match:  {success_rates['perfect_matches']}% ({success_rates['perfect_count']}/{total_files})

📈 METRICS:
   Total Tested: {total_files} | Errors: {error_count}
   Custom Failures: {len(worst_failures)} critical cases
"""
        
        if worst_failures:
            summary += f"""
⚠️  WORST CUSTOM FAILURES (first 3):
"""
            for filename in worst_failures[:3]:
                summary += f"   • {filename}\n"
        
        # Winner determination
        if success_rates['custom'] >= success_rates['guessit']:
            winner = "🥇 Custom Scanner"
            margin = success_rates['custom'] - success_rates['guessit']
        else:
            winner = "🥇 GuessIt"
            margin = success_rates['guessit'] - success_rates['custom']
        
        summary += f"""
🏆 VERDICT: {winner} (+{margin:.1f}%)

✨ RECOMMENDATION:
   {'🚀 Production ready!' if success_rates['custom'] >= success_rates['guessit'] else '🔧 Needs improvement for edge cases.'}
"""
        
        return summary

def save_results(results: List[Dict], filename: str):
    """Save comparison results to JSON file"""
    
    def serialize_value(value):
        """Convert non-serializable values to serializable format"""
        if hasattr(value, 'isoformat'):  # datetime, date objects
            return value.isoformat()
        elif isinstance(value, (list, tuple)):
            return [serialize_value(item) for item in value]
        elif isinstance(value, dict):
            return {k: serialize_value(v) for k, v in value.items()}
        else:
            return value
    
    serializable_results = []
    
    for result in results:
        if 'error' in result:
            serializable_results.append(result)
            continue
            
        serializable_result = {
            'filename': result['filename'],
            'type': result['type'],
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
            'expected_result': serialize_value(result['expected_result']),
            'comparison': serialize_value(result['comparison'])
        }
        serializable_results.append(serializable_result)
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(serializable_results, f, indent=2, ensure_ascii=False)

def main():
    """Run the external data comparison test"""
    print("🎬 External Data Comparison Test")
    print("Real-world test cases from GuessIt repository\n")
    
    # Initialize comparison tool
    comparison_tool = ExternalDataComparison("your_tmdb_api_key_here")
    
    # Load test files
    test_data = comparison_tool.load_test_files()
    
    if not test_data:
        print("❌ No test data loaded.")
        return
    
    # Show available data counts
    movies_count = len([k for k in test_data.get('movies', {}).keys() if k != '__default__']) if 'movies' in test_data else 0
    episodes_count = len([k for k in test_data.get('episodes', {}).keys() if k != '__default__']) if 'episodes' in test_data else 0
    total_count = movies_count + episodes_count
    
    print(f"📊 Available test cases:")
    print(f"   Movies: {movies_count:,}")
    print(f"   Episodes: {episodes_count:,}")
    print(f"   Total: {total_count:,}")
    
    # Enhanced test selection
    print("\nTest options:")
    print("[1] Movies only")
    print("[2] Episodes only") 
    print("[3] Both (sample)")
    print("[4] Custom sample size")
    print("[5] 🚀 ALL AVAILABLE DATA (full test)")
    
    choice = input("Choice (default=3): ").strip() or "3"
    
    if choice == "1":
        test_cases = comparison_tool.get_sample_tests("movies", 100)
        print(f"📋 Selected: Movies sample ({len(test_cases)} cases)")
    elif choice == "2":
        test_cases = comparison_tool.get_sample_tests("episodes", 100)
        print(f"📋 Selected: Episodes sample ({len(test_cases)} cases)")
    elif choice == "4":
        size = int(input("Sample size (default=100): ") or "100")
        test_cases = comparison_tool.get_sample_tests("both", size)
        print(f"📋 Selected: Custom sample ({len(test_cases)} cases)")
    elif choice == "5":
        # Load ALL available test cases
        print("🚀 Loading ALL available test cases...")
        test_cases = comparison_tool.get_sample_tests("both", -1)  # -1 means load all
        print(f"📋 Selected: ALL DATA ({len(test_cases):,} cases)")
        
        # Confirm for large datasets
        if len(test_cases) > 1000:
            confirm = input(f"⚠️  This will test {len(test_cases):,} files. Continue? (y/n): ").strip().lower()
            if confirm != 'y':
                print("❌ Test cancelled.")
                return
    else:
        test_cases = comparison_tool.get_sample_tests("both", 100)
        print(f"📋 Selected: Both types sample ({len(test_cases)} cases)")
    
    if not test_cases:
        print("❌ No test cases found. Check your YAML files.")
        return
    
    # Ask about raw GuessIt output
    show_raw = input("Show raw GuessIt output for worst cases? (y/n, default=n): ").strip().lower() == 'y'
    
    # Estimate time for large datasets
    if len(test_cases) > 500:
        estimated_time = len(test_cases) * 0.05  # Rough estimate: 50ms per file
        print(f"⏱️  Estimated processing time: {estimated_time/60:.1f} minutes")
    
    # Run tests
    start_time = time.time()
    print(f"\n🚀 Starting comprehensive test...")
    
    results = comparison_tool.batch_test(test_cases, show_raw)
    
    end_time = time.time()
    
    # Save and display results
    output_file = f'external_results.json'
    save_results(results, output_file)
    
    summary = comparison_tool.generate_summary(results)
    print(summary)
    
    # Enhanced completion message
    print(f"\n💾 Results saved to: {output_file}")
    print(f"⏱️  Processing time: {end_time - start_time:.1f}s")
    print(f"⚡ Average per file: {(end_time - start_time) / len(test_cases) * 1000:.1f}ms")
    
    if len(test_cases) >= total_count:
        print("🎉 COMPLETE DATASET TEST FINISHED!")
        print(f"   Tested {len(test_cases):,} / {total_count:,} available cases")

if __name__ == "__main__":
    main()