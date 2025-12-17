// frontend/src/components/features/BankReconciliation/PartyPicker.tsx
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { selectedPartyTypeAtom, selectedPartyAtom, selectedBankAccountAtom } from './bankRecAtoms';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { useMemo, useEffect } from 'react';
import { useCurrentCompany } from '@/hooks/useCurrentCompany';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2, User } from 'lucide-react';
import _ from '@/lib/translate';
import LinkFieldCombobox from '@/components/common/LinkFieldCombobox'; 
import { MissingFiltersBanner } from './MissingFiltersBanner';

// --- Party Type Options (Fixes Bug 1: Restricting Options) ---
const ALLOWED_PARTY_TYPES = ['Customer', 'Supplier'];

// Custom Hook to Fetch Party List
export const useGetParties = (partyType: string | undefined, company: string | undefined) => {
    
    const shouldFetch = !!partyType && !!company && ALLOWED_PARTY_TYPES.includes(partyType); 

    // NOTE: This calls the new Python API endpoint defined in party.py.
    return useFrappeGetCall<{ message: { name: string, title: string }[] }>('truebalance.apis.party.get_party_list', {
        party_type: partyType,
        company: company
    }, shouldFetch ? [partyType, company] : null, {
        revalidateOnFocus: false,
    });
};


const PartyPicker = () => {
    const [selectedPartyType, setSelectedPartyType] = useAtom(selectedPartyTypeAtom);
    const [selectedParty, setSelectedParty] = useAtom(selectedPartyAtom);
    const company = useCurrentCompany();

    // Reset Bank Account state when using Party Picker
    const setSelectedBank = useSetAtom(selectedBankAccountAtom);
    
    useEffect(() => {
        // Clear the bank account state when this picker is mounted
        setSelectedBank(null);
    }, [setSelectedBank]);


    // Set default party type if none is selected
    useEffect(() => {
        if (!selectedPartyType || !ALLOWED_PARTY_TYPES.includes(selectedPartyType)) {
            setSelectedPartyType('Customer');
        }
    }, [selectedPartyType, setSelectedPartyType]);
    
    
    // Fetch parties based on the selected type
    const { data: partyData, isLoading: isPartiesLoading } = useGetParties(selectedPartyType, company);

    // parties list derived from API is available via `partyData` and LinkFieldCombobox handles lookups,
    // so we don't need a local `parties` array here. Keep the memo logic removed to avoid unused var warnings.
    
    // --- Handlers ---
    
    const handlePartyTypeChange = (type: string) => {
        setSelectedPartyType(type);
        setSelectedParty(undefined); // Clear party selection on type change
    };
    
    const handlePartySelect = (partyId: string) => {
        console.debug('[PartyPicker] selected party:', partyId)
        setSelectedParty(partyId);
    };
    
    // --- Validation and Rendering ---

    if (!company) {
        return <MissingFiltersBanner text={_("Select a Company to load parties")} />
    }

    return (
        <div className="flex items-center gap-4">
            {/* 1. Party Type Selector (Custom Dropdown to restrict options) */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-w-32 h-9 text-left">
                        <User className="w-4 h-4 mr-2" />
                        {selectedPartyType ? _(selectedPartyType) : _("Select Party Type")}
                        <ChevronDown className="w-4 h-4 ml-auto" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {ALLOWED_PARTY_TYPES.map(type => (
                        <DropdownMenuItem key={type} onClick={() => handlePartyTypeChange(type)}>
                            {_(type)}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* 2. Party Selector (LinkFieldCombobox) */}
            {selectedPartyType && (
                <div className="flex items-center gap-2 w-full max-w-sm">
                    <span className="text-sm font-medium text-muted-foreground">{selectedPartyType}:</span>
                    <LinkFieldCombobox
                        doctype={selectedPartyType} 
                        value={selectedParty || ''}
                        onChange={handlePartySelect}
                        placeholder={_(`Search ${selectedPartyType}...`)}
                        // Note: List is auto-filtered by Doctype/Company using Frappe's LinkFieldCombobox logic
                    />
                    {isPartiesLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
            )}
            
            {/* 3. Missing Selection Banner */}
            {!selectedParty && selectedPartyType && !isPartiesLoading && (
                <MissingFiltersBanner text={_(`Select a ${selectedPartyType} to load entries`)} />
            )}
        </div>
    );
};

export default PartyPicker;