import BankBalance from "@/components/features/BankReconciliation/BankBalance"
import BankClearanceSummary from "@/components/features/BankReconciliation/BankClearanceSummary"
import BankPicker from "@/components/features/BankReconciliation/BankPicker"
import BankRecDateFilter from "@/components/features/BankReconciliation/BankRecDateFilter"
import BankReconciliationStatement from "@/components/features/BankReconciliation/BankReconciliationStatement"
import BankTransactions from "@/components/features/BankReconciliation/BankTransactionList"
import BankTransactionUnreconcileModal from "@/components/features/BankReconciliation/BankTransactionUnreconcileModal"
import CompanySelector from "@/components/features/BankReconciliation/CompanySelector"
import IncorrectlyClearedEntries from "@/components/features/BankReconciliation/IncorrectlyClearedEntries"
import MatchAndReconcile from "@/components/features/BankReconciliation/MatchAndReconcile"
import RuleConfigureButton from "@/components/features/BankReconciliation/Rules/RuleConfigureButton"
import Settings from "@/components/features/Settings/Settings"
// >>> NEW IMPORT: The PartyPicker component
import PartyPicker from "@/components/features/BankReconciliation/PartyPicker" 
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { H1 } from "@/components/ui/typography"
import _ from "@/lib/translate"
import { useLayoutEffect, useRef, useState } from "react"


const BankReconciliation = () => {
    console.log("TRUEBALANCE NEW UI LOADED");

    const [headerHeight, setHeaderHeight] = useState(0)
    // Keep this state for the switch
    const [dataSource, setDataSource] = useState<'Bank' | 'Debtor'>('Bank') 

    const ref = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
        if (ref.current) {
            setHeaderHeight(ref.current.clientHeight)
        }
    }, [])

    const remainingHeightAfterTabs = window.innerHeight - headerHeight - 324

    return (
        <div className="p-4 flex flex-col gap-4">
            <div ref={ref} className="flex flex-col gap-4">
                <div className="flex justify-between">
                    {/* H1 Title and Switch */}
                    <div className="flex flex-col"> 
                        <H1 className="text-base font-medium">
                            <span className="text-4xl font-extrabold text-emerald-500">TrueBalance</span>&nbsp; {_("Reconciliation Tool")}
                        </H1>
                        {/* Data Source Switch */}
                        <div className="mt-2 text-sm flex gap-4">
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="radio"
                                    value="Bank"
                                    checked={dataSource === 'Bank'}
                                    onChange={() => setDataSource('Bank')}
                                    className="h-4 w-4 text-emerald-500 border-gray-300 focus:ring-emerald-500"
                                />
                                {_("Bank Transactions")}
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="radio"
                                    value="Debtor"
                                    checked={dataSource === 'Debtor'}
                                    onChange={() => setDataSource('Debtor')}
                                    className="h-4 w-4 text-emerald-500 border-gray-300 focus:ring-emerald-500"
                                />
                                {_("Debtor Statement Entries")}
                            </label>
                        </div>
                    </div>
                    {/* Existing Filter/Settings buttons */}
                    <div className="flex items-center gap-2">
                        <RuleConfigureButton />
                        <Settings />
                        <CompanySelector />
                        <BankRecDateFilter />
                    </div>
                </div>
                
                {/* >>> PERMANENT UI FIX: CONDITIONAL RENDERING (Bank vs Party) <<< */}
                {dataSource === 'Bank' ? (
                    <>
                        <BankPicker /> 
                        <BankBalance />
                    </>
                ) : (
                    <>
                        {/* Party Picker replaces Bank Picker */}
                        <PartyPicker /> 
                        {/* You would add a Debtor-specific balance component here if needed */}
                    </>
                )}
            </div>
            <Tabs defaultValue="Match and Reconcile">
                <TabsList className="w-full">
                    <TabsTrigger value="Match and Reconcile">{_("Match and Reconcile")}</TabsTrigger>
                    <TabsTrigger value="Bank Reconciliation Statement">{_("Bank Reconciliation Statement")}</TabsTrigger>
                    <TabsTrigger value="Bank Transactions">{_("Bank Transactions")}</TabsTrigger>
                    <TabsTrigger value="Bank Clearance Summary">{_("Bank Clearance Summary")}</TabsTrigger>
                    <TabsTrigger value="Incorrectly ClearedEntries">{_("Incorrectly Cleared Entries")}</TabsTrigger>
                </TabsList>
                <TabsContent value="Match and Reconcile">
                    <MatchAndReconcile contentHeight={remainingHeightAfterTabs} dataSource={dataSource} />
                </TabsContent>
                <TabsContent value="Bank Reconciliation Statement">
                    <BankReconciliationStatement />
                </TabsContent>
                <TabsContent value="Bank Transactions">
                    <BankTransactions />
                </TabsContent>
                <TabsContent value="Bank Clearance Summary">
                    <BankClearanceSummary />
                </TabsContent>
                <TabsContent value="Incorrectly Cleared Entries">
                    <IncorrectlyClearedEntries />
                </TabsContent>
            </Tabs>

            <BankTransactionUnreconcileModal />
        </div>
    )
}

export default BankReconciliation