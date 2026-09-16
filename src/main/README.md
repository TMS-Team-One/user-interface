# ProbePilot

ProbePilot turns an Ultimaker 2+ into an automated PCB probing system.

The printer positions a probe above a PCB, while an Arduino and ADS1115 measure the voltage between two probe channels.
A LangGraph agent connects both parts and translates natural-language instructions into safe movement and measurement operations.

> ProbePilot is currently a hackathon prototype. Always supervise the printer while it is moving.

## How it works

```text
User instruction
      ↓
LangGraph agent
      ↓
Motion and voltage tools
      ↓
Ultimaker 2+ + Arduino/ADS1115
```

For example, the agent can process an instruction such as:
```Move to X=50, Y=50, Z=30 and measure the voltage.```

The language model cannot send arbitrary G-code or access the serial connections directly.
It can only use the registered tools, while the motion controller remains responsible for movement limits and
safe Z heights.


## Hardware
The current prototype uses:
- Ultimaker 2+
- Arduino UNO R4 Minima
- ADS1115 analog-to-digital converter


## Project structure
```
src/
├── agent/                  LangGraph agent and model configuration
├── motion_control/         Ultimaker movement control
├── voltage_measurement/    Arduino and ADS1115 communication
├── tools/                  Tools available to the agent
└── serial_ports.py         Automatic hardware port discovery

scripts/
├── manual_agent_test.py
├── manual_robot_control.py
└── manual_voltage_test.py
```

## Installation
1. Create and activate a virtual environment:  
    ```
    python -m venv .venv
    source .venv/bin/activate
    ```

2. Install the dependencies:  
    ```
    pip install -r requirements.txt
   ```

3. Create a `.env` file in the project root:  
    ```
    OPENAI_API_KEY=your-api-key
   ```

OpenAI and gpt-4o-mini are currently used by default. The model integration is provider-neutral, so another supported
LangChain provider can be added later without changing the graph.


## Serial-port discovery
ProbePilot automatically finds the connected voltage meter and Ultimaker using their USB vendor and product IDs.
This means changing port names such as: `/dev/cu.usbmodem14101`

do not normally require configuration.
To inspect the connected serial devices manually, run:  
```
python -m serial.tools.list_ports -v
```

Port discovery raises an error when a device is missing or when multiple matching devices are connected.

**Note**: only tested on MacOS, not on Windows/Linux.


## Running the agent
Make sure both devices are connected and the probing area is clear. Then run:  
```
python scripts/manual_agent_test.py
```

The script:
1. Loads the OpenAI API key from .env.
2. Asks for confirmation before connecting.
3. Homes the Ultimaker once.
4. Connects the motion and voltage tools to the agent.
5. Starts an interactive prompt.

Example instruction:  
```
There are multiple components on my PCB board: A=(50, 50, 30), B=(100, 50, 40), C=(200, 200, 30).
Please go to component A first, then B, then C and measure the voltage at each component.
```

Enter exit or quit to stop.
