# Story Engine

A collaborative worldbuilding system designed to prepare for and enhance the NovelAI LLM-based story-writing experience. Story Engine provides conversational, semi-automatic tools for developing rich narrative universes with structured data management capabilities.

## 🌟 Overview

Story Engine is a next-generation creative assistant that bridges the gap between unstructured brainstorming and structured worldbuilding. It features an intelligent multi-agent system that helps writers develop complex narratives, characters, and settings through conversational interactions.

### Vision Statement

To create a seamless loop between creative exploration and structured organization, enabling writers to build rich, interconnected universes that evolve naturally from initial concepts to detailed lorebooks and story-ready content.

## ✨ Current Features

### 🗣️ Multi-Agent Chat System
- **Four specialized AI agents** with distinct roles and personalities:
  - **Sage (Brainstorm)**: Experienced creative guide for exploration and ideation
  - **Critic & Orchestrator**: Sharp analyst that directs the creative process
  - **Anchor (Structure)**: Methodical synthesizer that organizes scattered ideas
  - **The Archivist**: Meticulous distiller of information for long-term memory

### 🎯 Intelligent Agent Coordination
- Automatic agent switching based on creative workflow state
- Manual override for specific agent targeting
- Configurable auto-mode for continuous creative sessions
- Context-aware agent recommendations

### 📝 Conversational Interface
- Real-time chat interface with AI agents
- Agent-specific visual indicators and personas
- Message history preservation and context management
- Configurable system prompts and agent behaviors

## 🚀 Planned Features

### 🔄 Complete DULFS Ecosystem
**Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics**

- **Structured extraction** from conversation to create DULFS elements
- **Automated categorization** of narrative components
- **Relationship mapping** between entities
- **Conflict analysis** and tension identification

### 📚 Lorebook Integration
- **Automatic generation** of NovelAI lorebook entries from DULFS
- **Schema-compliant** output with strict formatting
- **Bidirectional editing** - changes to lorebook update DULFS
- **Magic management** for dynamic content revision

### ✏️ Editable Chat Interface
- **Semi-editable** conversation history
- **Undo/redo** functionality for creative decisions
- **Branching conversation** support for alternative story paths
- **Version control** for creative iterations

### 🎛️ Advanced Configuration
- **Customizable agent prompts** and behaviors
- **Template system** for different genres and styles
- **Integration hooks** for external tools and workflows
- **Export capabilities** for multiple story formats

## 🏗️ Technical Architecture

### Core Components
- **`chat.ts`**: Central chat management and agent coordination
- **`ui.ts`**: User interface components and interaction handling
- **`hyper-generator.ts`**: Advanced text generation engine with budget management
- **`index.ts`**: Application entry point and system initialization

### Agent Framework
Each agent extends the abstract `Agent` class with specialized parameters:
- **Token limits** optimized for specific tasks
- **Temperature settings** balancing creativity vs. structure
- **Penalty parameters** controlling output focus and repetition
- **Custom prompts** defining agent behavior and personality

### Data Flow
```
Conversation → Agent Processing → DULFS Creation → Lorebook Generation
     ↑                                    ↓
     └─────────────── Revision ────────────┘
```

## 🚀 Getting Started

### Prerequisites
- NovelAI Script BuildSystem environment
- Node.js runtime
- TypeScript compiler

### Installation
1. Navigate to the project directory:
   ```bash
   cd projects/story-engine
   ```

2. Configure system prompts in `project.yaml`:
   ```yaml
   config:
     - name: system_prompt
       # Your custom system prompt
     - name: brainstorm_prompt
       # Sage's creative guidance prompt
     # ... other agent prompts
   ```

3. Build and run the project:
   ```bash
   npm run build
   npm run start
   ```

### Configuration Options

#### System Prompt
Configures the base LLM behavior for all agents:
```yaml
config:
  - name: system_prompt
    type: string
    default: # Comprehensive creative writing directives
```

#### Agent-Specific Prompts
Each agent has customizable personality and behavior:

- **`brainstorm_prompt`**: Sage's conversational guidance style
- **`critic_prompt`**: Critic's analytical and directive approach
- **`anchor_prompt`**: Anchor's methodical structuring process
- **`summary_prompt`**: Archivist's comprehensive summarization

## 🎮 Usage Guide

### Basic Workflow
1. **Start a conversation** with Sage for initial brainstorming
2. **Let Critic analyze** the output and direct next steps
3. **Use Anchor to structure** scattered ideas into organized content
4. **Call Archivist** to create comprehensive summaries when needed

### Agent Roles in Detail

#### 🧠 Sage (Brainstorm Agent)
- **Purpose**: Creative exploration and ideation
- **Style**: Conversational, encouraging, mentor-like
- **Output**: Open-ended questions and conceptual possibilities
- **Best for**: Initial worldbuilding, character development, exploring themes

#### 🔍 Critic & Orchestrator
- **Purpose**: Quality assessment and process management
- **Style**: Direct, analytical, decisive
- **Output**: Critical analysis and specific directives
- **Best for**: Keeping the process focused, determining next steps

#### 🏗️ Anchor (Structure Agent)
- **Purpose**: Organization and definition
- **Style**: Calm, methodical, precise
- **Output**: Structured summaries and organized information
- **Best for**: Solidifying creative progress, creating documentation

#### 📚 The Archivist
- **Purpose**: Long-term memory and comprehensive documentation
- **Style**: Impartial, focused, comprehensive
- **Output**: Complete structured synopses
- **Best for**: Milestone documentation, project overview

### Advanced Features

#### Auto Mode
Enable continuous creative sessions:
```typescript
ui.agentModeSelector.onAutoCheckbox = (isChecked: boolean) => {
  chat.autoMode = isChecked;
  chat.autoCount = 5; // Number of auto-generations
};
```

#### Agent Switching
Manually target specific agents or let the system orchestrate automatically based on workflow state.

## 🔄 Development Roadmap

### Phase 1: Enhanced Chat Interface (Current)
- [ ] Editable conversation history
- [ ] Undo/redo functionality
- [ ] Branching conversation support
- [ ] Version control integration

### Phase 2: DULFS Integration
- [ ] Automatic extraction from conversation
- [ ] Structured data storage and management
- [ ] Relationship mapping and visualization
- [ ] Conflict analysis tools

### Phase 3: Lorebook Ecosystem
- [ ] Automatic NovelAI lorebook generation
- [ ] Schema validation and formatting
- [ ] Bidirectional editing capabilities
- [ ] Magic management system

### Phase 4: Advanced Features
- [ ] Multi-project support
- [ ] Collaboration tools
- [ ] Template and genre presets
- [ ] Export to multiple formats

## 🤝 Contributing

Story Engine is part of the NovelAI Script BuildSystem ecosystem. Contributions are welcome in the following areas:

- Agent prompt optimization
- UI/UX improvements
- DULFS data structure design
- Lorebook integration features
- Performance optimization

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Original inspiration**: OccultSage for the hyper-generator concept
- **Current development**: Keilla
- **System design**: NovelAI LLM integration framework

## 📞 Support

For questions, suggestions, or bug reports, please open an issue in the project repository or join the NovelAI development community.

---

*Story Engine - Where creativity meets structure, and imagination finds its foundation.*