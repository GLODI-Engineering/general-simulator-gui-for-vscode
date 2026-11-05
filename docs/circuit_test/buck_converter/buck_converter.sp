* Buck converter direct SPICE demo
Vin vin 0 DC 12
Vgate gate 0 PULSE(0 5 0 20n 20n 5u 10u)
Ssw vin sw gate 0 SWMOD
.model SWMOD SW(Ron=0.02 Roff=1e6 Vt=2.5 Vh=0.5)
Dfree 0 sw DMOD
.model DMOD D(Is=1n Rs=0.05 N=1)
L1 sw out 100u IC=0
C1 out 0 100u IC=0
Rload out 0 10
.save v(out) v(sw) i(L1)
.tran 0.2u 2m UIC
.end
