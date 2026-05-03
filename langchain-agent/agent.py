"""
LangChain Agent with Floe lending tools.

Demonstrates: get_markets, instant_borrow, check_credit_status, repay_credit.
"""
import os
from dotenv import load_dotenv
from coinbase_agentkit import AgentKit, AgentKitConfig, CdpEvmServerWalletProvider, CdpEvmServerWalletProviderConfig
from coinbase_agentkit_langchain import get_langchain_tools
from floe_agentkit_actions import floe_action_provider
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

def main():
    print("🤖 LangChain + Floe Agent starting...")

    # Setup wallet (replace with your wallet provider)
    # wallet_provider = CdpEvmServerWalletProvider(...)

    # Create AgentKit with Floe actions
    # agentkit = AgentKit(AgentKitConfig(
    #     wallet_provider=wallet_provider,
    #     action_providers=[floe_action_provider()],
    # ))

    # Get LangChain tools
    # tools = get_langchain_tools(agentkit)

    # Create agent
    # llm = ChatOpenAI(model="gpt-4o")
    # prompt = ChatPromptTemplate.from_messages([
    #     ("system", "You are a DeFi agent that can lend, borrow, and manage loans on Floe."),
    #     ("human", "{input}"),
    #     ("placeholder", "{agent_scratchpad}"),
    # ])
    # agent = create_tool_calling_agent(llm, tools, prompt)
    # executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    # Run
    # result = executor.invoke({"input": "What lending markets are available on Floe?"})
    # print(result["output"])

    print("\n📝 Uncomment the code above and configure your wallet to run.")
    print("   See: https://floe-labs.gitbook.io/docs/developers/agentkit-python")

if __name__ == "__main__":
    main()
