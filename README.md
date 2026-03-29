# Last Caretaker Voyage Log Dumper

A UE4SS mod for *The Last Caretaker* that extracts voyage log data from the game and exports it to JSON format.

## Description

This mod allows you to dump all voyage logs and their associated fragments from *The Last Caretaker* game into a structured JSON file. This is useful for documentation, modding reference, or data analysis purposes.

## Features

- **Extract Voyage Logs**: Retrieves all `VoyageLogData` objects from the game
- **Extract Log Fragments**: Captures all `VoyageLogFragment` objects and associates them with their parent logs
- **JSON Export**: Exports data in a clean, readable JSON format with proper indentation
- **Key Binding**: Simple F3 key press to trigger the dump

## Installation

1. Install [UE4SS specifically for TLC](https://www.nexusmods.com/thelastcaretaker/mods/4) for *The Last Caretaker*
2. Copy the `T1KTLCVoyageLogDumper` folder to your game's `Mods` directory:
   ```
   [Game Directory]/The Last Caretaker/Binaries/Win64/ue4ss/Mods/
   ```
3. Add `T1KTLCVoyageLogDumper : 1` to mods.txt

## Usage

1. Launch *The Last Caretaker*
2. Press **F2** to dump the voyage logs and locations
    * Press **F3** to dump the Maze Room Numbers (must be at the maze)
3. If **F2** Used, data will be exported to `voyage_logs_dump.json` and `voyage_location_dump.json` in the game's directory
    * Optional, run `sort_logs_by_id.ps1` so that the order of the logs is the same for version tracking.
4. If **F3** Used, data will be in `voyage_maze_numbers_dump.json`
    * Run `update_transposium_numbers.ps1` to add a new sheet to `Transposium_Numbers.xlsx`
5. Check the console output for confirmation messages

## Output Format

The generated JSON file contains an array of voyage logs with the following structure:

```json
[
  {
    "id": "VoyageLog_Example",
    "title": "Log Title",
    "description": "Log description text",
    "footer": "Footer text",
    "fragments": [
      {
        "id": "VoyageLog_Example:Fragment_01",
        "title": "Fragment Title",
        "description": "Fragment description"
      }
    ]
  }
]
```

## Project Structure

```
T1KTLCVoyageLogDumper/
├── Scripts/
│   ├── main.lua         # Main mod logic and key binding
│   └── jsonshim.lua     # JSON serialization utility
```

## How It Works

1. **Data Collection**: The mod uses UE4SS's `FindAllOf()` function to locate all `VoyageLogData` and `VoyageLogFragment` and `VoyageLocatorComponent` objects in the game
2. **Fragment Association**: Fragments are matched to their parent logs based on naming patterns
3. **JSON Conversion**: A custom JSON serializer converts the Lua tables to properly formatted JSON
4. **File Export**: The data is written to `voyage_logs_dump.json` and `voyage_location_dump.json` in the current directory

## Requirements

- The Last Caretaker (game)
- [UE4SS specifically for TLC](https://www.nexusmods.com/thelastcaretaker/mods/4)

## License

This is a modding tool for personal use. Please respect the game's terms of service and copyright.

## Credits

Created for *The Last Caretaker* modding community by The1Killer.
