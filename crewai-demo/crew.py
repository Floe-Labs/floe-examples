"""
CrewAI Demo with Floe lending tools.

A crew of agents that monitors DeFi markets and manages lending positions.
"""
import os
from dotenv import load_dotenv

load_dotenv()

def main():
    print("🚢 CrewAI + Floe Demo starting...")
    print()
    print("This demo creates a crew with two agents:")
    print("  1. Market Analyst — monitors Floe lending rates")
    print("  2. Portfolio Manager — borrows and manages positions")
    print()
    print("Setup:")
    print("  1. pip install -r requirements.txt")
    print("  2. Configure .env with your wallet key + OpenAI key")
    print("  3. Uncomment the crew code below")
    print()
    print("See: https://floe-labs.gitbook.io/docs/developers/agentkit-python")

    # from crewai import Agent, Task, Crew
    # from crewai_tools import MCPServerAdapter
    #
    # # Connect to Floe MCP
    # floe_tools = MCPServerAdapter(
    #     server_url="https://mcp.floelabs.xyz/mcp",
    #     transport="streamable-http",
    # ).tools
    #
    # analyst = Agent(
    #     role="Market Analyst",
    #     goal="Monitor Floe lending markets for the best rates",
    #     tools=floe_tools,
    # )
    #
    # manager = Agent(
    #     role="Portfolio Manager",
    #     goal="Borrow USDC at the best available rate",
    #     tools=floe_tools,
    # )
    #
    # task = Task(
    #     description="Check current USDC/WETH lending rates and report the best offer",
    #     agent=analyst,
    # )
    #
    # crew = Crew(agents=[analyst, manager], tasks=[task])
    # result = crew.kickoff()
    # print(result)

if __name__ == "__main__":
    main()
