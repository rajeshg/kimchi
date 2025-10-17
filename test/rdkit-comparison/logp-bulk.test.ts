import { describe, it, expect } from 'bun:test';
import { parseSMILES, computeLogP } from 'index';

const TEST_SMILES = [
  'C1CC(OC1)CN2C(=O)C3=CC=CC=C3N=C2SCC(=O)NC4=CC(=CC(=C4)Cl)Cl',
  'C1=CC(=CC(=C1)C(F)(F)F)C(=O)ONC(=O)C2=CC=C(C=C2)C(F)(F)F',
  'C1COCCN1C(=O)CN(C2=CC(=CC=C2)Cl)S(=O)(=O)C3=CC=CC=C3',
  'CC1=CC(=CC=C1)S(=O)(=O)C2=C(N(C3=NC4=CC=CC=C4N=C23)N=CC5=CC=CC=N5)N',
  'C1CCN(CC1)CN2C3=CC=CC=C3C(=C2O)N=NC(=S)NC4=CC=C(C=C4)F',
  'CC1=NC2=C(C=NN2C(=C1)NCCC3=CC(=C(C=C3)OC)OC)C4=CC=CC=C4',
  'C1=COC(=C1)CN2C(C(=C(C2=O)O)C(=O)C3=CC=CO3)C4=CC=CS4',
  'CC(C)CNC(=O)C1=CSC(=N1)CN(CC(C)C)C(=O)C2=CC(=CC=C2)OC',
  'CN(C)S(=O)(=O)C1=CC=C(C=C1)C(=O)NC2=NN=C(S2)SCC(=O)N3CCCC4=CC=CC=C43',
  'COC1=CC(=C(C=C1)C(=O)NN=CC2=CC(=C(C(=C2)Br)O)Br)OC',
  'CC1=CCC2(C(C1)C(=O)OC2=O)C',
  'CN1C(=O)C(=CC2=CC3=C(C=C2)N(CCC3)CC4=CC=CC=C4)C(=O)N(C1=O)C',
  'C1CC(N(C1)C(C2=CC=CC=C2)C3=CC=C(C=C3)C(F)(F)F)C(=O)O',
  'COC1=CC(=C(C=C1)C(=O)COC(=O)C2=C(C(=CC=C2)Cl)Cl)OC',
  'CC1=CC=CC=C1OC2=C(C(=O)N3C=CC=CC3=N2)C=C(C#N)C(=O)OC',
  'CC1=C(N=C(S1)NC(=O)CSC2=NN=C(O2)C3=CC=CC=C3)C4=CC=CC=C4',
  'C1=CC=C(C=C1)/C=C/C=C\\2/C(=O)C3=C(O2)C=C(C=C3)OCC(=O)C4=CC=C(C=C4)Br',
  'C1=C(N=C(S1)C2C(C(C(O2)CO)O)O)C(=O)N',
  'CC(C)CCN(CC1=CC=C(C=C1)OS(=O)(=O)C)C(=O)COC2=CC=CC=C2',
  'CCOCC(=O)NC1=CC=CC=C1C(C)C',
  'C1=CC(=CC=C1OC(=O)C2=CSC(=N2)COC3=CC4=NON=C4C=C3)Cl',
  'CP(=O)(N1CCOC1=O)OC2=CC=CC=C2',
  'CCOC1=CC=C(C=C1)C(=O)NN=CC2=CC=C(S2)Br',
  'CCC(C)(C)C1=CC(=C(C=C1)OCCCCNC(=O)C2=CC(=NN2C3=CC=CC=C3Cl)C4=CC=C(C=C4)F)C(C)(C)CC',
  'CCOC(=O)C1=CC=C(C=C1)N2C(C3C(C24C(=O)C5=CC=CC=C5C4=O)C(=O)OC3=O)C6=CC=C(C=C6)C',
  'CCOC1=CC2=C(C=C1)OC(=C2C(=O)OC3=CC4=C(C=C3)C(=O)/C(=C/C5=C(C=CC(=C5)OC)OC)/O4)C6=CC=CC=C6',
  'CCC(C)(C)NC(=S)NC1=C(C=CC(=C1)C)C',
  'C1=CC=C(C=C1)C=CC(=O)NC(=S)NNC(=O)COC2=C(C=C(C=C2)Cl)Cl',
  'CCOC1=C(C=C(C=C1)C(=O)C)CSC2=NC3=CC=CC=C3C(=O)N2C4=CC(=CC=C4)OC',
  'COC1=CC=CC(=C1)C(=O)C=CC2=CN(N=C2C3=CC4=C(C=C3)OCCO4)C5=CC=CC=C5',
  'CCOC1=CC=CC(=C1)N(C(C2=CC=CC=C2)C(=O)NCC3CCCO3)C(=O)CNC(=O)C4=CC=CS4',
  'CC1=CC(=C2C=C(C(=O)NC2=C1)CN(C3CCCCC3)C(=S)NCCC4=CC(=C(C=C4)OC)OC)C',
  'C1CCN(CC1)C(=O)CSC2=NC3=CC=CC=C3C4=NC5=CC=CC=C5N42',
  'COC1=CC=C(C=C1)CN(CC2=CC=CC=N2)C(=S)NC3=CC(=CC=C3)OC',
  'COC1=C(C=CC(=C1)/C=C(/C#N)\\C(=S)N)OCC2=CC=CC=C2Cl',
  'C1=COC(=C1)CN2C(=NN=C2SCC(=O)C3=CC=C(C=C3)Cl)C4=CC=CO4',
  'C1CCN(CC1)C(=O)C2=CC=C(C=C2)NC(=O)NC3=CC=C(C=C3)F',
  'CCCN1C(=NN=N1)NC(=S)NC(=O)C2=CC=C(C=C2)C(C)(C)C',
  'CCCC(=O)NCCCN1C=CN=C1',
  'CC1=CC(=C(O1)C)C(=O)NN=CC2=CC(=CC=C2)OC',
  'CC(COCC(COCC(C)O)OCC(C)O)O',
  'CC1=NC(=C(C=C1)OC(=O)C23CC4CC(C2)CC(C4)C3)C',
  'C1CCCN(CC1)S(=O)(=O)C2=CC3=C(C=C2)NC(=C3C=O)C4=CC=C(C=C4)C5=CC=CC=C5',
  'CCOC(=O)C1=C(C=CC(=C1)NC(=S)C2=CC=CC=C2)Cl',
  'C1=CC=C(C=C1)N2C(=O)C3=C(C2=O)C=C(C=C3)NC(=O)/C=C/C4=CC=CO4',
  'C=CCOC1=CC=C(C=C1)C(=O)N2CCCC2',
  'CCOC(=O)CN1C2=C(C=C(C=C2)OC)SC1=NC(=O)C3=C(C4=CC=CC=C4S3)Cl',
  'C1OC2=C(O1)C=C(C=C2)C3=C(N=NN3C4=NON=C4N)C(=O)NN=CC5=CN=CC=C5',
  'CC(=NNC1=NC(=NC(=C1)C2=CC=CC=C2)C3=CC=CC=C3)C4=CC=CC=C4',
  'CC1=C(C=C(C=C1)NC(=O)NC2=CC=CC(=C2)C(F)(F)F)NC(=O)NC3=CC=CC(=C3)C(F)(F)F',
  'CC(=O)C1=C(C=CC(=C1)Cl)OCC2CN(CCO2)C(=O)CN3N=C(N=N3)C4=CC=CC=C4',
  'CC1=C(C(=NO1)C2=C(C=CC=C2Cl)F)C3=NC=C(S3)C(=O)C4=CC=C(C=C4)Cl',
  'CC1=C2C(=CC=C1)C=C(C(=N2)Cl)C3C(=C(NC(=C3C(=O)OC)C)C)C(=O)OC',
  'C1CCC(C1)NC(=O)C2=COC(=N2)CCN',
  'CCOC(=O)C(C(C)C)N1C(SC(C1=O)C)C2=CC=C(C=C2)C3=CC=CC=C3',
  'CCN1CCCN2C=CC=C2C1',
  'C1=NC(=C2C(=N1)N=C(N2)C(C(C(CO)O)O)O)N',
  'CCOC(=O)C1=C(NC2=C(C1C3=CC=CC=C3OCC4=CC=CC=C4C#N)C(=O)C5=CC=CC=C52)C',
  'CC1=C(C=C(C=C1)NC(=O)COC2=CC=CC=C2)I',
  'CC1CN(C(CN1C(=O)C2CC3CCC2C3)C)C(=O)C4CC5CCC4C5',
  'CCOC(=O)C1=CN=C(N=C1N)SCC(=O)NC2=C(C=C(C=C2)Cl)Cl',
  'CCCCCCCCNC(=O)C1=CC=C(C=C1)OCC',
  'C1CCN(CC1)C2(CCN(CC2)C(=O)NC34CC5CC(C3)CC(C5)C4)C(=O)N',
  'CC1=CC=CC=C1N2C=NN=C2SCC(=O)N3CCN(CC3)C4=CC=CC=C4',
  'C1=CC=C(C=C1)C2=C(NC(=N2)C3=CC(=CC=C3)Cl)C4=CC=CC5=CC=CC=C54',
  'C1=CC=C(C=C1)CCCNC(=O)COC2=CC(=C(C=C2)Cl)Cl',
  'CCN(CC)CC1=C(C=CC2=C1C(=C(O2)C)C(=O)C3=CC=C(C=C3)Br)O',
  'C1=CC=C(C(=C1)COC2=C(C=C(C=C2)C=C3C(=O)N=C(S3)N)Cl)F',
  'COC1=C(C=C(C=C1)C(C2=NN=NN2C3CCCCC3)N4CCN(CC4)C5=CC=C(C=C5)F)OC',
  'C1=CC=C(C=C1)C(CCCOC2=CC=CC=C2)C#N',
  'CC1=CC=CC=C1N(C(C2=CC=C(C=C2)F)C(=O)NC3CCCC3)C(=O)CNC(=O)C4=CC=CS4',
  'C1CCN(CC1)CCNC(=O)/C(=C/C2=CC=C(O2)C3=CC=C(C=C3)Br)/C#N',
  'CC1CCC(=O)N1CC#CCN(C)CCBr',
  'CC1=CC(=C(C=C1)NS(=O)(=O)C2=CC=C(C=C2)N=CC3=CC=C(C=C3)F)C',
  'CC(=O)NC1=CC=C(C=C1)CN2CCCN(CC2)C(=S)NC3=C(C(=C(C=C3F)F)F)F',
  'CCOC1=CC=C(C=C1)NC(=O)CSC2=NN=C(N2C3=C(C=CC(=C3)OC)OC)C4=CNC5=CC=CC=C54',
  'CC1=C(OC2=CC3=C(C=C12)C(=C(C(=O)O3)CCC(=O)NC4=C(C=C(C=C4)F)F)C)C',
  'CCOC1=C(C=C(C=C1)C)S(=O)(=O)N2CCOCC2',
  'C1CCN(C1)S(=O)(=O)C2=C(C=CC(=C2)C(=O)OCC(=O)NCC3=CC=C(C=C3)F)Cl',
  'CC1CCN(CC1)C(C)C(=O)NC2=C(NC3=C2C(=CC=C3)OC)C(=O)OC',
  'C1CN(CCC1C(=O)NC2CCN(CC2)CC3=CC=CC=C3)S(=O)(=O)C4=CC=CC5=NSN=C54',
  'CC(C)CN(CC(C)C)S(=O)(=O)C1=CC=C(C=C1)OP(=S)(OC)OC',
  'CCCCOC1=CC=C(C=C1)C(=C2C(N(C(=O)C2=O)C3=NC(=C(S3)C(=O)OC)C)C4=CC(=CC=C4)OC)O',
  'CC1=CC(=NC(=N1)N=C(N)NC2=C(C=C(C=C2)OC)OC)C',
  'COC1=CC=C(C=C1)C(=O)NNC(=O)/C=C/C2=CC=CO2',
  'C(CSC#N)C(=O)O',
  'C1=CC=C2C(=C1)NC(=N2)CCC(=O)C(C#N)C3=NC4=CC=CC=C4S3',
  'CCOC1=C(C2=CC=CC=C2C=C1)C(=O)NC3=C4CS(=O)CC4=NN3C5=C(C=C(C=C5)C)C',
  'CC(C)CNC(=O)C1=CC(=NN1C2=CC=CC=C2Cl)C3=CC=CC=C3',
  'CN1CCN(CC1)C(=O)NCCC2CCCCC2',
  'CCN(CC1=CC=CC=C1)S(=O)(=O)C2=CC=C(C=C2)S(=O)(=O)N(CC3=CC=CC=C3)CC4=CC=CO4',
  'COC1=CC=C(C=C1)NC(=O)N2CCN(CC2)C3=NC=NC4=C3SN=C4C5=CC=C(C=C5)F',
  'COC1=C(C(=CC(=C1)/C=C/C(=O)OCC2=CC=C(O2)C(=O)OC)Cl)OC',
  'CCCOC1=CC=CC(=C1)C2C(=C(C3=CC=C(C=C3)OCC)O)C(=O)C(=O)N2CCN(CC)CC',
  'C1=CC=C2C(=C1)C3=CC=CC=C3C2=NNC(=O)CN4C5=CC=CC=C5N=C4C(F)(F)F',
  'COC1=CC=C(C=C1)CC(C#N)C2=NC3=CC=CC=C3S2',
  'C1=CC(=C(C=C1C(F)(F)F)NC(=O)CSC2=NC3=C(O2)C=CC(=C3)Cl)Cl',
  'CCOC1=CC=CC=C1NC(=O)COC(=O)C2=CC(=CC=C2)Br',
  'CCC(C)C1=CC=C(C=C1)C2C3=C(C4=CC=CC=C4C3=O)NC5=CC=CC=C5S2',
  'CC1=CC(=CC=C1)NC(=O)CSC2=C(C(=CC(=N2)C3=CC=CS3)C4=CC=CS4)C#N',
  'CCOCCOC(=O)C1=C(NC(=O)CC1C2=CC=CC=C2OCC)C',
  'CC1=C(NN=C1C2=CC=CC=C2)C(=O)NNC(=C)C3=CC=C(C=C3)Cl',
  'CC(C)C1CC(OC(=C1)C(=O)NCCCCC(=O)NC2=CC=CC=C2N)OCC3=CC=C(C=C3)CO',
  'CC(C)(C)C1=CC2=C(C(=C1)S(=O)(=O)O)OC(=CC2=O)C3=CC=CC=C3',
  'CC1=CC(=C(C=C1)NC(=O)CSC2=NN=C(N2N)C3CCCCC3)Br',
  'COCCCNC(=O)NC1=C(C=C(C=C1)F)F',
  'CC1=CC(=CC=C1)C2=NC(=NO2)C3=CN=CC=C3',
  'CCCCCCCCCCCCC(CCC1=CC=CC=C1)C2=CC=NC=C2',
  'COC1=C(C=C(C=C1)Br)C=C2C(=O)NC(=O)N(C2=O)CCC3=CCCCC3',
  'C1=CC=C(C=C1)CN2C=CN=C2SCC(=O)NC3=NC=CS3',
  'CCC1=CC=C(O1)C2N(C(=O)CCS2)CC3=NC=C(N=C3)C',
  'CC1=C(C(NC(=O)N1)C2=CC=CC=C2Br)C(=O)NC3=C(C=CC(=C3)Cl)OC',
  'CC(C)NC(=O)COC(=O)C1=CC=CC=C1NC(=O)CC2=CC=CC=C2',
  'CCCCC(C(CCC)CCC)C(=O)O',
  'CCN(CC)S(=O)(=O)C1=CC=C(C=C1)/C=C/C(=O)NC2=CC(=C(C=C2)OC)OC',
  'CCOC1=CC=CC=C1C(=O)N(CC2=CC(=CC=C2)Br)C3CCS(=O)(=O)C3',
  'CC1=CC=C(C=C1)OCCNC(=O)C2=CC=CC3=CC=CC=C32',
  'C1CN2C=CN(OC2C3=CC=CC=C31)C4=CC=CC=C4',
  'CC(C)(C)N/C=C(\\C#N)/S(=O)(=O)C1=CC=C(C=C1)Br',
  'C1CCN(CC1)CC(=O)NC2=CC=CC3=C2C(=O)C4=CC=CC=C4C3=O',
  'CCOC1=CC=C(C=C1)CC(=O)NC2=CC=C(C=C2)S(=O)(=O)N3CCOCC3',
  'COC1=CC=C(C=C1)C2=NC(=NC=C2)C3=CC=CS3',
  'C=CCN1C2=C(C=C(C=C2)Br)C(=C1O)N=NC(=S)NC3=CC=CC=C3F',
  'CC1=CC=C(C=C1)C2=CSC(=N2)NN',
  'C1=CC=C(C=C1)CNC2=CC=CC3=C2C=CN3',
  'CCCCCCCCCCCCSCC(C)C(=O)OC',
  'CC1=CC=C(C=C1)OCC(=O)NC2=CC3=C(C=C2)OC(=N3)C4=C(C=C(C=C4)F)Cl',
  'C1=CC=C(C=C1)C=CC2=CC(=CC=C2)C#N',
  'C1=CC=C(C=C1)C2=NC3=CC=CC=C3C(=C2)C(=O)NC4=C(C=CC=C4Cl)Cl',
  'CCC(O)(P(=O)(O)O)P(=O)(O)O',
  'CC(C)C(C(=O)NCC1=CC=C(C=C1)OC)NS(=O)(=O)C2=CC3=C(C=C2)N(CCC3)C(=O)C',
  'CC1=CC=C(C=C1)C2=NC3=CC=CC=C3C(=C2C)C(=O)NC4=C(C(=C(S4)C(=O)OC)C)C(=O)OC',
  'CCN1C(=NN=C1SCC(=O)NC2=NC=C(S2)C)CNC3=C(C=C(C=C3)C)C',
  'C1OC2=C(O1)C=C(C=C2)C(=O)NC3=C(C=CS3)C(=O)N',
  'C1=CC=C(C=C1)CN=C2N(C(=O)/C(=C/C3=CC=C(O3)C4=CC=C(C=C4)C(=O)O)/S2)CC5=CC=CC=C5',
  'CCOC(=O)NC(=O)COC(=O)/C=C/C1=C(C=C(C=C1)OC)OC',
  'CN(C)C(=O)C1=CC=CC=C1C2=NC(=NO2)C3=CC=CC=C3Cl',
  'COC1=CC=C(C=C1)N2CC(CC2=O)C(=O)OCC(=O)C3=CC(=CC=C3)OC',
  'CC1=CC(=C(C=C1)C)N(C(C2=CC(=C(C(=C2)OC)OC)OC)C(=O)NC3CCCC3)C(=O)C4=CC=CO4',
  'C1=CC=C2C(=C1)N=C3C4=C(C=CC(=C4)Br)N(C3=N2)CC#N',
  'COC1=C(C=CC(=C1)CC=C)OCCOC2=CC=CC(=C2)C=NN3C=NN=C3',
  'COC1=CC=C(C=C1)NC(=O)NC2=CC=CC(=C2)C3=NC4=CC=CC=C4N=C3',
  'CCC1=CC(=C(S1)NC(=O)C2=CC3=C(C=C2)OCO3)C(=O)OCC',
  'CCOC(=O)C1=C(SC(=C1)C)NC(=S)NC2=CC=CC=C2',
  'CC1CC(C2=C(N1C(=O)CN3C(=O)C4=CC=CC=C4C3=O)C(=CC(=C2)OC)OC)NC5=C(C=C(C=C5)OC)OC',
  'CC(=O)CSC1=NC2=C(C=CC(=C2)Cl)C(=O)N1CC3=CC=CC=C3',
  'C1CCC(C1)NC(=O)CN(C2=C(C=C(C=C2)Cl)Cl)S(=O)(=O)C3=CC=CC=C3',
  'CN1C=C(C2=CC=CC=C21)C=C(C#N)C(=O)NC3=CC=C(C=C3)O',
  'C1=CC(=CN=C1)C2=NNC(=N2)C3=CC=C(C=C3)O',
  'CCCOC1=CC=C(C=C1)C(=O)NC2=CC=CC=C2N3CCN(CC3)C(=O)C4=CC=C(C=C4)Cl',
  'CC(=O)OC1=CCCCCCC1',
  'C1CCC(CC1)NC2=NN=C(S2)SCC(=O)N3CC(=O)NC4=CC=CC=C43',
  'CC1=C(C=C(C=C1)N2C(=O)C3=C(C2=O)C=C(C=C3)C(=O)NC4=CC=C(C=C4)C(=O)C)C',
  'C1=CC=C(C(=C1)C2=NC3=CC(=C(C=C3N2)F)Cl)C(=O)O',
  'CN1C2=CC=CC=C2N=C1C3=CC=C(O3)C4=CC=CC=C4',
  'COC1=CC(=CC(=C1OC)OC)C2=CC(=O)C3=C(O2)C=CC(=C3)OCC(=O)NC4=CC(=CC(=C4)Cl)Cl',
  'CN(C)S(=O)(=O)C1=CC=CC(=C1)C(=O)NC2=CC=C(C=C2)OC3=CC=CC=C3',
  'COC1=C(C=C(C=C1)N)CCC(=O)O',
  'CCCCN(CC(=O)NC1=CC(=NN1C2=CC=C(C=C2)OC)C(C)(C)C)C(=O)C3=CC(=CC=C3)C(F)(F)F',
  'CC(C)CN1C(=O)/C(=C/C2=C(N=C3C=CC=CN3C2=O)N4CCN(CC4)C)/SC1=S',
  'CCOP(=O)(C)C',
  'CCCCN(C(C1=CC=CC=C1Cl)C(=O)NC2CCCC2)C(=O)CC3=CC=CS3',
  'CC1=CC=C(C=C1)C2NC3=C(C(=O)N2)SC(=S)N3C4=CC=CC=C4',
  'CC1=CC2=NC(=C(N2C=C1)CN3CCC(CC3)C(=O)O)C4=CC(=C(C=C4)OC)OC',
  'C1=CC(=C(C=C1Cl)Cl)C2=CSC(=N2)C3=NC(=CS3)C4=C(C=C(C=C4)Cl)Cl',
  'CC1=CC(=NC(=N1)NNC2=NC(=CC(=N2)C)C)C',
  'CCOC1=CC=C(C=C1)C2=C(SC(=N2)NC(=O)CC3=CC=C(C=C3)C4=CC=CC=C4)C',
  'C1CN(CCC1C(=O)N2CCOCC2)CC3=CC=CC=C3',
  'C1CC(OC1)CN(CCC#N)C(=O)NC2=C(C=CC(=C2)F)F',
  'CC(=O)C(C(CO)O)O',
  'CCN(CC)CC(C)CNC(=O)C1=CC(=O)NC2=C1C=C(C=C2)S(=O)(=O)N3CCCCCC3',
  'COC1=CC2=C(C=C1)NC=C2CCN=CC3=C(C(=C(C=C3)OC)OC)C(=O)O',
  'C1COCCN1CC2=C(C(=CC(=C2)OC3=CC(=C(C(=C3)Cl)O)CN4CCOCC4)Cl)O',
  'CC12CCP(=O)(C1C(=NO2)C3=CC=CC=C3)OC4=CC=CC=C4',
  'C1CCC(CC1)NC(=O)CCSC2=NC(=CC(=N2)C(F)(F)F)C3=CC4=C(C=C3)OCO4',
  'CCN1C(=NN=C1SCC(=O)NC2=CC=CC=C2C(C)(C)C)C3=CC=CC=C3OC',
  'CC1=CN=C(C=N1)C(=O)N(CCCOC)CCC(=O)N2CCN(CC2)C3=CC=CC=C3OC',
  'CC1=CC(=CC(=C1)N2C(=C(C(=CC3=CC=CO3)C2=O)C(=O)OC)C)C',
  'COC1=CC(=C(C=C1)OC)C2(CSC(=NC3=CN=CC=C3)N2C4CC4)O',
  'CC(C)N(CCSC1=NN=C(S1)SCCN(C(C)C)C(C)C)C(C)C',
  'CN(CC1=CC=C(C=C1)Cl)CC(=O)NC2=CC=CC=C2SC',
  'CC1=CC=C(C=C1)C=NNC(=O)C(=O)NC2=CC=CC=N2',
  'CCC1=CC=C(C=C1)OCC(=O)NNC(=O)C2=CC=C(C=C2)OC(F)(F)F',
  'CN(CCNC(=O)C1=CNC2=C1CC3=CC=CC=C32)CCNC(=O)C4=CNC5=C4CC6=CC=CC=C65',
  'COC1=CC2=C(C=C1)N=C(C=C2C(=O)NCCCN3CCOCC3)C4=CC5=C(C=C4)OCO5',
  'COC1=CC=C(C=C1)NC(=O)C2=CC=C(O2)COC3=CC4=CC=CC=C4C=C3',
  'COC1=CC=C(C=C1)C2=NC3=CC=CC=C3C(=C2)C(=O)NC4=C(C=CC(=C4)S(=O)(=O)NC5=CC=CC=C5OC)Cl',
  'COC1=CC=C(C=C1)S(=O)(=O)NCC(=O)OCC(=O)NC2=CC3=CC=CC=C3C=C2',
  'C/C(=C/C(=O)O)/C=C/C1=CNC2=CC=CC=C21',
  'CCCCCCCCP(CCCCCCCC)C1CCCCC1',
];

describe('LogP Bulk Comparison with RDKit', () => {
  // Gate long-running RDKit tests behind RUN_LOGP_BULK
  const runFull = !!process.env.RUN_LOGP_BULK;
  if (!runFull) {
    it('skipped (set RUN_LOGP_BULK=1 to run)', () => {
      // Long-running LogP bulk test skipped by default
    });
    return;
  }

  it(`compares LogP against RDKit for ${TEST_SMILES.length} diverse molecules`, async () => {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) {
      throw new Error('RDKit is not available. Install with: npm install @rdkit/rdkit');
    }
    const initRDKitModule = rdkitModule.default;
    const rdkit: any = await (initRDKitModule as any)();

    const failures: string[] = [];

    for (const smiles of TEST_SMILES) {
      const parsed = parseSMILES(smiles);
      expect(parsed.errors).toEqual([]);
      const mol = parsed.molecules[0]!;
      const ourLogP = computeLogP(mol, true);

      const rdkitMol = rdkit.get_mol(smiles);
      const rdkitLogP = JSON.parse(rdkitMol.get_descriptors()).CrippenClogP;
      rdkitMol.delete();

      const diff = Math.abs(ourLogP - rdkitLogP);
      if (diff >= 0.2) {
        failures.push(`${smiles} -> Our: ${ourLogP}, RDKit: ${rdkitLogP}, Diff: ${diff}`);
      }
    }

    // Report failures
    if (failures.length > 0) {
      console.log(`\nLogP Bulk Test Failures (${failures.length}/${TEST_SMILES.length}):`);
      failures.slice(0, 10).forEach(failure => console.log(failure));
      if (failures.length > 10) {
        console.log(`... and ${failures.length - 10} more`);
      }
    }

    // Allow some tolerance for complex molecules - expect >99% to be within 0.2
    // Based on documentation: >99% of molecules within 0.2 LogP units of RDKit
    expect(failures.length).toBeLessThanOrEqual(2);
  }, 120000); // 2 minute timeout
});