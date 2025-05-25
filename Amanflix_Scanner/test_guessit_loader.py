import yaml
import os
from pathlib import Path
import time
from typing import Dict, Any, List

class GuessItTestLoader:
    def __init__(self, test_files_dir: str = "/Users/almogcohen/Downloads"):
        self.test_files_dir = Path(test_files_dir)
        self.movies_file = self.test_files_dir / "movies (1).yml"
        self.episodes_file = self.test_files_dir / "episodes (1).yml"
        self.test_data = {}
        
    def load_test_files(self) -> Dict[str, Any]:
        """Load both movies and episodes test files"""
        print("Loading GuessIt test files...")
        
        # Load movies
        if self.movies_file.exists():
            with open(self.movies_file, 'r', encoding='utf-8') as f:
                movies_data = yaml.safe_load(f)
                self.test_data['movies'] = movies_data
                print(f"Loaded {len(movies_data)} movie test cases")
        else:
            print(f"Movies file not found: {self.movies_file}")
            
        # Load episodes
        if self.episodes_file.exists():
            with open(self.episodes_file, 'r', encoding='utf-8') as f:
                episodes_data = yaml.safe_load(f)
                self.test_data['episodes'] = episodes_data
                print(f"Loaded {len(episodes_data)} episode test cases")
        else:
            print(f"Episodes file not found: {self.episodes_file}")
            
        return self.test_data
    
    def get_sample_tests(self, category: str = "both", sample_size: int = 100) -> List[Dict[str, Any]]:
        """Get a sample of test cases for testing"""
        sample_tests = []
        
        if category in ["both", "movies"] and "movies" in self.test_data:
            movies_items = list(self.test_data["movies"].items())
            movie_sample = movies_items[:sample_size//2 if category == "both" else sample_size]
            
            for filename, expected in movie_sample:
                if filename != "__default__":  # Skip default config
                    sample_tests.append({
                        "filename": filename,
                        "expected": expected,
                        "type": "movie"
                    })
        
        if category in ["both", "episodes"] and "episodes" in self.test_data:
            episodes_items = list(self.test_data["episodes"].items())
            episode_sample = episodes_items[:sample_size//2 if category == "both" else sample_size]
            
            for filename, expected in episode_sample:
                if filename != "__default__":  # Skip default config
                    sample_tests.append({
                        "filename": filename,
                        "expected": expected,
                        "type": "episode"
                    })
        
        return sample_tests
    
    def run_test_comparison(self, test_cases: List[Dict[str, Any]], use_guessit: bool = True):
        """Run tests and compare results"""
        print(f"\nRunning {len(test_cases)} test cases...")
        print("=" * 60)
        
        correct = 0
        total = 0
        errors = []
        
        for i, test_case in enumerate(test_cases):
            filename = test_case["filename"]
            expected = test_case["expected"]
            file_type = test_case["type"]
            
            try:
                if use_guessit:
                    # Use GuessIt library
                    import guessit
                    result = guessit.guessit(filename)
                else:
                    # Use your custom implementation
                    result = self.custom_parse(filename)
                
                # Compare key fields
                matches = self.compare_results(result, expected)
                if matches:
                    correct += 1
                else:
                    errors.append({
                        "filename": filename,
                        "expected": expected,
                        "actual": result,
                        "type": file_type
                    })
                
                total += 1
                
                # Progress indicator
                if (i + 1) % 100 == 0:
                    print(f"Processed {i + 1}/{len(test_cases)} tests...")
                    
            except Exception as e:
                errors.append({
                    "filename": filename,
                    "error": str(e),
                    "type": file_type
                })
                total += 1
        
        # Results
        accuracy = (correct / total) * 100 if total > 0 else 0
        print(f"\nResults:")
        print(f"Total tests: {total}")
        print(f"Correct: {correct}")
        print(f"Accuracy: {accuracy:.2f}%")
        print(f"Errors: {len(errors)}")
        
        # Show first few errors
        if errors:
            print(f"\nFirst 5 errors:")
            for error in errors[:5]:
                print(f"File: {error['filename']}")
                if 'error' in error:
                    print(f"Error: {error['error']}")
                else:
                    print(f"Expected: {error['expected']}")
                    print(f"Actual: {error['actual']}")
                print("-" * 40)
        
        return {
            "total": total,
            "correct": correct,
            "accuracy": accuracy,
            "errors": errors
        }
    
    def compare_results(self, actual: Dict, expected: Dict) -> bool:
        """Compare actual vs expected results for key fields"""
        key_fields = ['title', 'year', 'season', 'episode', 'type']
        
        for field in key_fields:
            if field in expected:
                if field not in actual or actual[field] != expected[field]:
                    return False
        return True
    
    def custom_parse(self, filename: str) -> Dict[str, Any]:
        """Placeholder for your custom parsing implementation"""
        # This is where you'd implement your own parsing logic
        # For now, returning empty dict
        return {"title": "Unknown"}

def main():
    # Initialize loader
    loader = GuessItTestLoader()
    
    # Load test files
    test_data = loader.load_test_files()
    
    if not test_data:
        print("No test data loaded. Please check file paths.")
        return
    
    # Choose test type
    print("\nChoose test type:")
    print("1. Movies only")
    print("2. Episodes only") 
    print("3. Both (default)")
    print("4. Custom sample size")
    
    choice = input("Enter choice (1-4, default=3): ").strip()
    
    if choice == "1":
        test_cases = loader.get_sample_tests("movies", 200)
    elif choice == "2":
        test_cases = loader.get_sample_tests("episodes", 200)
    elif choice == "4":
        try:
            sample_size = int(input("Enter sample size (default=100): ") or "100")
            test_cases = loader.get_sample_tests("both", sample_size)
        except ValueError:
            test_cases = loader.get_sample_tests("both", 100)
    else:
        test_cases = loader.get_sample_tests("both", 200)
    
    # Choose implementation
    print("\nChoose implementation to test:")
    print("1. GuessIt library (reference)")
    print("2. Custom implementation")
    
    impl_choice = input("Enter choice (1-2, default=1): ").strip()
    use_guessit = impl_choice != "2"
    
    if use_guessit:
        try:
            import guessit
            print("Using GuessIt library for testing...")
        except ImportError:
            print("GuessIt not installed. Install with: pip install guessit")
            return
    else:
        print("Using custom implementation...")
    
    # Run tests
    start_time = time.time()
    results = loader.run_test_comparison(test_cases, use_guessit)
    end_time = time.time()
    
    print(f"\nTest completed in {end_time - start_time:.2f} seconds")
    
    # Save results
    if input("\nSave detailed results to file? (y/n): ").lower() == 'y':
        output_file = f"test_results_{int(time.time())}.yml"
        with open(output_file, 'w') as f:
            yaml.dump(results, f, default_flow_style=False)
        print(f"Results saved to {output_file}")

if __name__ == "__main__":
    main()