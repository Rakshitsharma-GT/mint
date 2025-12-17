import { bankRecDateAtom, bankRecMatchFilters, bankRecSelectedTransactionAtom, bankRecUnreconcileModalAtom, SelectedBank, selectedBankAccountAtom, selectedPartyAtom } from './bankRecAtoms'
import { useAtomValue, useSetAtom } from 'jotai'
import { useMemo } from 'react'
import { useFrappeGetCall, useFrappeGetDoc, useFrappePostCall, useSWRConfig } from 'frappe-react-sdk'
import { BankTransaction } from '@/types/Accounts/BankTransaction'
import { BankAccount } from '@/types/Accounts/BankAccount'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { BANK_LOGOS } from './logos'
import { getErrorMessage } from '@/lib/frappe'
import { useCurrentCompany } from '@/hooks/useCurrentCompany'
import _ from '@/lib/translate'
import { MintBankTransactionRule } from '@/types/Mint/MintBankTransactionRule'

// >>> MODIFIED: ADD dataSource PARAMETER
export const useGetAccountOpeningBalance = (dataSource: "Bank" | "Debtor") => {

    const companyID = useCurrentCompany()
    const bankAccount = useAtomValue(selectedBankAccountAtom)

    const dates = useAtomValue(bankRecDateAtom)

    const args = useMemo(() => {

        return {
            bank_account: bankAccount?.name,
            company: companyID,
            till_date: dayjs(dates.fromDate).subtract(1, 'days').format('YYYY-MM-DD'),
            data_source: dataSource // <<< PASS DATA SOURCE
        }

    }, [companyID, bankAccount?.name, dates.fromDate, dataSource])

    return useFrappeGetCall('erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.get_account_balance', args, undefined, {
        revalidateOnFocus: false
    })
}

// >>> MODIFIED: ADD dataSource PARAMETER
export const useGetAccountClosingBalance = (dataSource: "Bank" | "Debtor") => {

    const companyID = useCurrentCompany()
    const bankAccount = useAtomValue(selectedBankAccountAtom)

    const dates = useAtomValue(bankRecDateAtom)

    const args = useMemo(() => {

        return {
            bank_account: bankAccount?.name,
            company: companyID,
            till_date: dates.toDate,
            data_source: dataSource // <<< PASS DATA SOURCE
        }

    }, [companyID, bankAccount?.name, dates.toDate, dataSource])

    return useFrappeGetCall('erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.get_account_balance', args,
        `bank-reconciliation-account-closing-balance-${bankAccount?.name}-${dates.toDate}`,
        {
            revalidateOnFocus: false
        }
    )

}

export type UnreconciledTransaction = Pick<BankTransaction, 'name' | 'matched_rule' | 'date' | 'withdrawal' | 'deposit' | 'currency' | 'description' | 'status' | 'transaction_type' | 'reference_number' | 'party_type' | 'party' | 'bank_account' | 'company' | 'unallocated_amount'>


// >>> MODIFIED: The main hook for fetching external entries
export const useGetUnreconciledTransactions = (dataSource: "Bank" | "Debtor") => {
    // Get both potential account IDs
    const bankAccount = useAtomValue(selectedBankAccountAtom);
    const partyId = useAtomValue(selectedPartyAtom); // The ID (CUST-00001 or SUPP-00001)
    const dates = useAtomValue(bankRecDateAtom);

    // --- DETERMINE THE ACTIVE ACCOUNT ID ---
    let accountId: string | undefined = undefined;

    if (dataSource === 'Bank') {
        // If Bank, use the selected Bank Account name
        accountId = bankAccount?.name;
    } else if (dataSource === 'Debtor') {
        // If Debtor, use the selected Party ID
        accountId = partyId;
    }

    // --- CONTROL FETCHING ---
    // Only proceed if we have a valid ID and dates
    const shouldFetch = !!accountId && !!dates.fromDate && !!dates.toDate;

    // Debug logging to help trace flow when toggling data sources
    console.debug('[useGetUnreconciledTransactions] dataSource:', dataSource, 'accountId:', accountId, 'dates:', dates, 'shouldFetch:', shouldFetch)

    if (!shouldFetch) {
        // Return a disabled SWR response so callers always get a consistent shape (includes mutate)
        return useFrappeGetCall<{ message: UnreconciledTransaction[] }>('truebalance.apis.transactions.get_bank_transactions', {
            bank_account: accountId,
            from_date: dates.fromDate,
            to_date: dates.toDate,
            data_source: dataSource
        }, null, {
            revalidateOnFocus: false,
            revalidateIfStale: false
        });
    }

    // SWR Key MUST change when any input changes to trigger a new fetch
    const swrKey = `bank-reco-unreco-${accountId}-${dates.fromDate}-${dates.toDate}-${dataSource}`;

    console.debug('[useGetUnreconciledTransactions] swrKey:', swrKey)

    return useFrappeGetCall<{ message: UnreconciledTransaction[] }>('truebalance.apis.transactions.get_bank_transactions', {
        // The Python API expects the target ID (Bank or Party) in 'bank_account'
        bank_account: accountId,
        from_date: dates.fromDate,
        to_date: dates.toDate,
        data_source: dataSource
    }, swrKey, {
        revalidateOnFocus: false,
        revalidateIfStale: false
    });
}

export interface LinkedPayment {
    rank: number,
    doctype: string,
    name: string,
    paid_amount: number,
    reference_no: string,
    reference_date: string,
    posting_date: string,
    party_type?: string,
    party?: string,
    currency: string
}

// >>> MODIFIED: ADD dataSource PARAMETER
export const useGetBankTransactions = (dataSource: "Bank" | "Debtor") => { // <<< ACCEPT DATA SOURCE
    // Get both potential account IDs
    const bankAccount = useAtomValue(selectedBankAccountAtom);
    const partyId = useAtomValue(selectedPartyAtom); // The ID (CUST-00001 or SUPP-00001)
    const dates = useAtomValue(bankRecDateAtom);

    // --- DETERMINE THE ACTIVE ACCOUNT ID ---
    let accountId: string | undefined = undefined;

    if (dataSource === 'Bank') {
        // If Bank, use the selected Bank Account name
        accountId = bankAccount?.name;
    } else if (dataSource === 'Debtor') {
        // If Debtor, use the selected Party ID
        accountId = partyId;
    }

    // --- CONTROL FETCHING ---
    // Only proceed if we have a valid ID and dates
    const shouldFetch = !!accountId && !!dates.fromDate && !!dates.toDate;

    if (!shouldFetch) {
        // Return a disabled SWR response so callers always get a consistent shape (includes mutate)
        return useFrappeGetCall<{ message: BankTransaction[] }>('truebalance.apis.transactions.get_bank_transactions', {
            bank_account: accountId,
            from_date: dates.fromDate,
            to_date: dates.toDate,
            all_transactions: true,
            data_source: dataSource
        }, null, { revalidateOnFocus: false, revalidateIfStale: false });
    }

    const swrKey = `bank-reconciliation-bank-transactions-${accountId}-${dates.fromDate}-${dates.toDate}-${dataSource}`;

    return useFrappeGetCall<{ message: BankTransaction[] }>('truebalance.apis.transactions.get_bank_transactions', {
        bank_account: accountId,
        from_date: dates.fromDate,
        to_date: dates.toDate,
        all_transactions: true,
        data_source: dataSource // <<< PASS DATA SOURCE
    }, swrKey);
}


// >>> MODIFIED: ADD dataSource PARAMETER
export const useGetVouchersForTransaction = (transaction: UnreconciledTransaction, dataSource: "Bank" | "Debtor") => { // <<< ACCEPT DATA SOURCE

    const dates = useAtomValue(bankRecDateAtom)
    const matchFilters = useAtomValue(bankRecMatchFilters)

    return useFrappeGetCall<{ message: LinkedPayment[] }>('truebalance.apis.reconciliation.get_vouchers_for_reco', {
        bank_transaction_name: transaction.name,
        document_types: matchFilters ?? ['payment_entry', 'journal_entry'],
        from_date: dates.fromDate,
        to_date: dates.toDate,
        filter_by_reference_date: 0,
        data_source: dataSource // <<< PASS DATA SOURCE
    }, `bank-reconciliation-vouchers-${transaction.name}-${dates.fromDate}-${dates.toDate}-${matchFilters.join(',')}-${dataSource}`, { // <<< ADD dataSource to SWR key
        revalidateOnFocus: false
    })
}

/**
 * Common hook to refresh the unreconciled transactions list after a transaction is reconciled
 * @returns function to call to refresh the unreconciled transactions list AFTER the operation is done
 */
// >>> MODIFIED: ADD dataSource PARAMETER
export const useRefreshUnreconciledTransactions = (dataSource: "Bank" | "Debtor") => { // <<< ACCEPT DATA SOURCE

    const selectedBank = useAtomValue(selectedBankAccountAtom)
    // >>> FIX 1: Explicitly get partyId from the atom value
    const partyId = useAtomValue(selectedPartyAtom);
    const dates = useAtomValue(bankRecDateAtom)
    const matchFilters = useAtomValue(bankRecMatchFilters)

    // >>> FIX 2: Correctly determine the account ID for the selected transaction atom
    const accountId = dataSource === 'Bank' ? selectedBank?.name : partyId;

    // If accountId is null, use a safe empty string or a default value for the atom key
    const atomKey = accountId || '';

    // Use the correctly scoped accountId in the atom key
    const setSelectedTransaction = useSetAtom(bankRecSelectedTransactionAtom(atomKey))

    const { mutate } = useSWRConfig()

    // Pass data source to hook used internally
    const { data: unreconciledTransactions } = useGetUnreconciledTransactions(dataSource)

    /** * This function should be called after a transaction is reconciled
     * It will get the next unreconciled transaction and select it
     * And then refresh the balance + unreconciled transactions list
     */
    const onReconcileTransaction = (transaction: UnreconciledTransaction, updatedTransaction?: BankTransaction) => {

        // Use the determined accountId for the mutate keys
        const accountMutateKey = accountId || selectedBank?.name;

        // If the updated transaction has an unallocated amount of 0, then we need to select the next unreconciled transaction
        if (updatedTransaction && updatedTransaction?.unallocated_amount !== 0) {
            mutate(`bank-reco-unreco-${accountMutateKey}-${dates.fromDate}-${dates.toDate}-${dataSource}`)
            mutate(`bank-reconciliation-account-closing-balance-${selectedBank?.name}-${dates.toDate}`)
            // Update the matching vouchers for the selected transaction
            mutate(`bank-reconciliation-vouchers-${transaction.name}-${dates.fromDate}-${dates.toDate}-${matchFilters.join(',')}-${dataSource}`)
            return
        }

        const currentIndex = unreconciledTransactions?.message.findIndex(t => t.name === transaction.name)
        let nextTransaction = null

        if (currentIndex !== undefined && currentIndex !== -1) {
            // Check if there is a next transaction
            if (currentIndex < (unreconciledTransactions?.message.length || 0) - 1) {
                nextTransaction = unreconciledTransactions?.message[currentIndex + 1]
            }
        }

        // We need to select the next unreconciled transaction for a better UX
        mutate(`bank-reco-unreco-${accountMutateKey}-${dates.fromDate}-${dates.toDate}-${dataSource}`)
            .then(res => {
                if (nextTransaction) {
                    // Check if next transaction is there in the response
                    const nextTransactionObj = res?.message.find((t: UnreconciledTransaction) => t.name === nextTransaction.name)
                    if (nextTransactionObj) {
                        setSelectedTransaction([nextTransactionObj])
                    } else {
                        // If the next transaction is not there in the response, we need to select the first unreconciled transaction
                        const firstTransaction = res?.message && res?.message.length > 0 ? res?.message[0] : null
                        if (firstTransaction) {
                            setSelectedTransaction([firstTransaction])
                        } else {
                            setSelectedTransaction([])
                        }
                    }
                } else {
                    // If there is no next transaction, we need to select the first unreconciled transaction
                    const firstTransaction = res?.message && res?.message.length > 0 ? res?.message[0] : null
                    if (firstTransaction) {
                        setSelectedTransaction([firstTransaction])
                    } else {
                        setSelectedTransaction([])
                    }
                }
            })
        mutate(`bank-reconciliation-account-closing-balance-${selectedBank?.name}-${dates.toDate}`)
    }

    return onReconcileTransaction

}

// >>> MODIFIED: ADD dataSource PARAMETER
export const useReconcileTransaction = (dataSource: "Bank" | "Debtor") => { // <<< ACCEPT DATA SOURCE

    const { call, loading } = useFrappePostCall<{ message: BankTransaction }>('truebalance.apis.bank_reconciliation.reconcile_vouchers')

    // Pass data source to hook used internally
    const onReconcileTransaction = useRefreshUnreconciledTransactions(dataSource)

    const setBankRecUnreconcileModalAtom = useSetAtom(bankRecUnreconcileModalAtom)

    const reconcileTransaction = (transaction: UnreconciledTransaction, vouchers: LinkedPayment[]) => {

        call({
            bank_transaction_name: transaction.name,
            vouchers: JSON.stringify(vouchers.map(v => ({
                "payment_doctype": v.doctype,
                "payment_name": v.name,
                "amount": v.paid_amount
            }))),
            data_source: dataSource // <<< ADD data_source parameter
        }).then((res) => {
            onReconcileTransaction(transaction, res.message)
            toast.success(_("Reconciled"), {
                duration: 4000,
                closeButton: true,
                action: {
                    label: _("Undo"),
                    onClick: () => setBankRecUnreconcileModalAtom(transaction.name)
                },
                actionButtonStyle: {
                    backgroundColor: "rgb(0, 138, 46)"
                }
            })
        }).catch((error) => {
            console.error(error)
            toast.error(_("Error"), {
                duration: 5000,
                description: getErrorMessage(error)
            })
        })
    }

    return { reconcileTransaction, loading }

}

interface BankAccountWithCurrency extends Pick<BankAccount, 'name' | 'bank' | 'account_name' | 'is_credit_card' | 'company' | 'account' | 'account_type' | 'account_subtype' | 'bank_account_no' | 'last_integration_date'> {
    account_currency?: string
}

export const useGetBankAccounts = (onSuccess?: (data?: Omit<SelectedBank, 'logo'>[]) => void, filterFn?: (bank: SelectedBank) => boolean) => {

    const company = useCurrentCompany()

    const { data, isLoading, error } = useFrappeGetCall<{ message: BankAccountWithCurrency[] }>('truebalance.apis.bank_account.get_list', {
        company: company
    }, undefined, {
        revalidateOnFocus: false,
        revalidateIfStale: false,
        onSuccess: (data) => {
            onSuccess?.(data?.message)
        }
    })

    const banks = useMemo(() => {
        // Match the bank account to the logo
        const banksWithLogos = data?.message.map((bank) => {
            const logo = BANK_LOGOS.find((logo) => logo.keywords.some((keyword) => bank.bank?.toLowerCase().includes(keyword.toLowerCase())))
            return {
                ...bank,
                logo: logo?.logo
            }
        }) ?? []

        if (filterFn) {
            return banksWithLogos.filter(filterFn)
        }

        return banksWithLogos
    }, [data, filterFn])

    return {
        banks,
        isLoading,
        error
    }

}

export const useIsTransactionWithdrawal = (transaction: UnreconciledTransaction) => {
    return useMemo(() => {
        const isWithdrawal = transaction.withdrawal && transaction.withdrawal > 0
        const isDeposit = transaction.deposit && transaction.deposit > 0

        return {
            amount: isWithdrawal ? transaction.withdrawal : transaction.deposit,
            isWithdrawal,
            isDeposit
        }
    }, [transaction])
}

export const useGetRuleForTransaction = (transaction: UnreconciledTransaction) => {

    return useFrappeGetDoc<MintBankTransactionRule>('Mint Bank Transaction Rule TB', transaction.matched_rule,
        transaction.matched_rule ? undefined : null, {
        revalidateOnFocus: false,
        revalidateIfStale: false
    }
    )
}