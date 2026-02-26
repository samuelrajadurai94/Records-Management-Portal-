import re
import json
import time
import base64
import tempfile
from datetime import datetime, timezone
from typing import List, Optional, Dict
import requests
from pydantic import BaseModel, Field
#from google import genai
#from google.genai import types

from pydantic import BaseModel, Field
#from typing import Optional, List
from typing import get_origin, get_args, List
from pydantic import BaseModel
from typing import Optional, List, Literal

def build_empty_model(model_cls: type[BaseModel]) -> BaseModel:
    values = {}

    for field_name, field_info in model_cls.model_fields.items():
        annotation = field_info.annotation
        origin = get_origin(annotation)
        args = get_args(annotation)

        # -----------------------------
        # List[...] → create ONE empty item
        # -----------------------------
        if origin in (list, List):
            item_type = args[0] if args else None

            if isinstance(item_type, type) and issubclass(item_type, BaseModel):
                # Create one empty component
                values[field_name] = [build_empty_model(item_type)]
            else:
                values[field_name] = []

        # -----------------------------
        # Nested Pydantic model
        # -----------------------------
        elif isinstance(annotation, type) and issubclass(annotation, BaseModel):
            values[field_name] = build_empty_model(annotation)

        # -----------------------------
        # Optional[NestedModel]
        # -----------------------------
        elif origin is not None and any(
            isinstance(a, type) and issubclass(a, BaseModel) for a in args
        ):
            nested_model = next(
                a for a in args if isinstance(a, type) and issubclass(a, BaseModel)
            )
            values[field_name] = build_empty_model(nested_model)

        # -----------------------------
        # Primitive fields
        # -----------------------------
        else:
            values[field_name] = None

    return model_cls.model_construct(**values)


class StatementHeader(BaseModel):
    #statement_type: str = Field(..., description="Type of statement (Non-Incident, Non-Accident, Clearance).")

    statement_date: str = Field(None, description="Date the statement was issued.if not found, It is the last date of Period during which the aircraft or component was operated")

    operator_name: str = Field(..., description="Operator or organization issuing the statement.")
    
    operating_period: str = Field(None,description=(
            "Period during which the aircraft or component was operated, "
            "e.g. '17 Nov 2013 to 06 May 2020'."
        )
    )

    incident_involved: bool = Field(..., description="Whether any incident or accident is declared.")

    signed_by: Optional[str] = Field(None, description="Name of the signatory.")   

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class IncidentAccidentStatement_listData(BaseModel):
    header: StatementHeader
    components: List[ComponentItem]

class StatementHeader(BaseModel):
    #statement_type: str = Field(..., description="Type of statement (Non-Incident, Non-Accident, Clearance).")

    statement_date: str = Field(None, description="Date the statement was issued.if not found, It is the last date of Period during which the aircraft or component was operated")

    operator_name: str = Field(..., description="Operator or organization issuing the statement.")
    
    operating_period: str = Field(None,description=(
            "Period during which the aircraft or component was operated, "
            "e.g. '17 Nov 2013 to 06 May 2020'."
        )
    )

    exceedance_declared: bool = Field(...,description=(
        "Whether any operational exceedance (e.g. over-temperature, "
        "over-speed, or limits exceedance) is declared. "
        "False indicates a Non-Exceedance statement."))

    signed_by: Optional[str] = Field(None, description="Name of the signatory.")   

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class NonExceedance_Statement_listData(BaseModel):
    header: StatementHeader
    components: List[ComponentItem]


class PMADERStatementHeader(BaseModel):
    # statement_type intentionally omitted (document type is implicit)

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the PMA / DER statement was issued. "
            "If not explicitly mentioned, use execution date or last date of the declared operating or maintenance period."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, MRO, or organization issuing the PMA / DER statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period covered by the declaration (engine operation period, "
            "shop visit duration, or maintenance review period)."
        )
    )

    statement_scope: Literal[
        "ENGINE",
        "AIRCRAFT",
        "SHOP_VISIT",
        "COMPONENT"
    ] = Field(
        ...,
        description=(
            "Scope of the declaration. "
            "ENGINE (most common), AIRCRAFT, SHOP_VISIT, or COMPONENT."
        )
    )

    pma_status: Literal[
        "NO_PMA",
        "PMA_PRESENT",
        "NOT_STATED"
    ] = Field(
        ...,
        description="Whether PMA parts are declared as installed or not installed."
    )

    der_status: Literal[
        "NO_DER",
        "DER_PRESENT",
        "NOT_STATED"
    ] = Field(
        ...,
        description="Whether DER repaired or altered parts are declared."
    )


    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class PMADER_Statement_listData(BaseModel):
    header: PMADERStatementHeader
    components: List[ComponentItem]


class Thrustrating_StatementHeader(BaseModel):
    # statement_type intentionally omitted (document type is implicit)

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the PMA / DER statement was issued. "
            "If not explicitly mentioned, use execution date or last date of the declared operating or maintenance period."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, MRO, or organization issuing the PMA / DER statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period covered by the declaration (engine operation period, "
            "shop visit duration, or maintenance review period)."
        )
    )

    declared_thrust_rating: Optional[str] = Field(
        None,
        description=(
            "Declared thrust / power rating configuration "
            "(e.g., 22,000 lbs, 26,000 lbs, -7B26, Category B)."
        )
    )

    thrust_rating_type: Optional[Literal[
        "TAKEOFF",
        "MAX_CONTINUOUS",
        "DERATED",
        "MIXED",
        "NOT_SPECIFIED"
    ]] = Field(
        "NOT_SPECIFIED",
        description=(
            "Type of thrust rating declared. "
            "Some statements include takeoff and max continuous ratings."
        )
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class ThrustRating_Statement_listData(BaseModel):
    header: Thrustrating_StatementHeader
    components: List[ComponentItem]

class Oilfuelused_StatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the oil / fuel / fluid statement was issued. "
            "If not found, use the execution or signing date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator or organization issuing the oil / fuel / fluid statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period during which the aircraft or engine was operated using the declared "
            "oil / fuel / fluids (e.g. 'From delivery to removal', "
            "'17 Nov 2018 to present')."
        )
    )

    

    fuel_type_used: Optional[str] = Field(
        None,
        description=(
            "Fuel type used during operation "
            "(e.g., Jet A1, Jet A, TS-1)."
        )
    )

    fuel_type_not_used: Optional[str] = Field(
        None,
        description=(
            "Fuel type explicitly declared as NOT used "
            "(e.g., TS-1 fuel never used, CIS fuel not used)."
        )
    )

    engine_oil_type: Optional[str] = Field(
        None,
        description=(
            "Engine oil type used "
            "(e.g., Mobil Jet Oil II, Mobil Jet Oil 254)."
        )
    )

    apu_oil_type: Optional[str] = Field(
        None,
        description="APU oil type used, if declared."
    )

    hydraulic_fluid_type: Optional[str] = Field(
        None,
        description=(
            "Hydraulic fluid type used "
            "(e.g., HYJET IV-A Plus, HYJET V)."
        )
    )

    other_fluids_used: Optional[List[str]] = Field(
        None,
        description=(
            "Other declared fluids (e.g., IDG oil, starter oil, HMU oil)."
        )
    )

    

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

    

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class Oilfuelused_Statement_listData(BaseModel):
    header: Oilfuelused_StatementHeader
    components: List[ComponentItem]


class ETOPS_StatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the oil / fuel / fluid statement was issued. "
            "If not found, use the execution or signing date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator or organization issuing the oil / fuel / fluid statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period during which the aircraft or engine was operated using the declared "
            "oil / fuel / fluids (e.g. 'From delivery to removal', "
            "'17 Nov 2018 to present')."
        )
    )

    

    etops_status: Literal[
        "ETOPS",
        "NON_ETOPS"
    ] = Field(
        ...,
        description="Whether the engine / aircraft was operated under ETOPS or Non-ETOPS configuration."
    )

    etops_approval_minutes: Optional[int] = Field(
        None,
        description=(
            "ETOPS approval level in minutes (e.g., 120, 180). "
            "Null if Non-ETOPS."
        )
    )

    etops_operated_minutes: Optional[int] = Field(
        None,
        description=(
            "ETOPS minutes actually operated, if different from approval "
            "(e.g., approved 180, operated 120)."
        )
    )

    

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

    

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class ETOPS_Statement_listData(BaseModel):
    header: ETOPS_StatementHeader
    components: List[ComponentItem]


class Commercial_StatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the oil / fuel / fluid statement was issued. "
            "If not found, use the execution or signing date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator or organization issuing the oil / fuel / fluid statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period during which the aircraft or engine was operated using the declared "
            "oil / fuel / fluids (e.g. 'From delivery to removal', "
            "'17 Nov 2018 to present')."
        )
    )

    

    seller_name: str = Field(
        ...,
        description="Legal name of the Seller transferring title."
    )

    seller_jurisdiction: Optional[str] = Field(
        None,
        description="Jurisdiction or country of Seller incorporation."
    )

    buyer_name: str = Field(
        ...,
        description="Legal name of the Buyer receiving title."
    )

    buyer_jurisdiction: Optional[str] = Field(
        None,
        description="Jurisdiction or country of Buyer incorporation."
    )

    asset_type: Literal[
        "AIRCRAFT",
        "ENGINE",
        "AIRCRAFT_AND_ENGINES"
    ] = Field(
        ...,
        description="Type of aviation asset transferred under the Bill of Sale."
    )
    

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

    

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class Commercial_Statement_listData(BaseModel):
    header: Commercial_StatementHeader
    components: List[ComponentItem]

class Preservation_StatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the oil / fuel / fluid statement was issued. "
            "If not found, use the execution or signing date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator or organization issuing the oil / fuel / fluid statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period during which the aircraft or engine was operated using the declared "
            "oil / fuel / fluids (e.g. 'From delivery to removal', "
            "'17 Nov 2018 to present')."
        )
    )

    

    preservation_date: Optional[str] = Field(
        None,
        description="Date on which preservation or purge was performed."
    )

    preservation_station: Optional[str] = Field(
        None,
        description="Station or facility where preservation was carried out."
    )

    preservation_period_category: Literal[
        "0_30_DAYS",
        "0_90_DAYS",
        "30_365_DAYS"
    ] = Field(
        ...,
        description="Preservation duration category selected on the tag."
    )

    engine_operable_status: Optional[Literal[
        "OPERABLE",
        "NON_OPERABLE"
    ]] = Field(
        None,
        description="Engine operability status during preservation."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

    

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class Preservation_Statement_listData(BaseModel):
    header: Preservation_StatementHeader
    components: List[ComponentItem]


class ARC_StatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the oil / fuel / fluid statement was issued. "
            "If not found, use the execution or signing date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator or organization issuing the oil / fuel / fluid statement."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Period during which the aircraft or engine was operated using the declared "
            "oil / fuel / fluids (e.g. 'From delivery to removal', "
            "'17 Nov 2018 to present')."
        )
    )

    

    status_or_work: Optional[str] = Field(
        None,
        description="Status or work performed (Repaired, Manufactured, Inspected, Overhauled)."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory."
    )

    

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class ARC_Statement_listData(BaseModel):
    header: ARC_StatementHeader 
    components: List[ComponentItem] 


class LRUQECStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the LRU / QEC inventory or status document was issued. "
            "If not explicitly stated, use inventory or signing date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, MRO, or organization issuing the LRU / QEC document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Context period for the inventory (e.g., at installation, "
            "at removal, shop visit close-out, lease return)."
        )
    )

    inventory_scope: Literal[
        "ENGINE",
        "QEC",
        "LRU"
    ] = Field(
        ...,
        description="Scope of the document: Engine QEC, LRU list, or combined."
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model to which the LRU / QEC configuration applies."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    aircraft_registration: Optional[str] = Field(
        None,
        description="Aircraft registration if stated in the document."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of person certifying or issuing the inventory."
    )


# -----------------------------
# Component / LRU / QEC Item
# -----------------------------
class LRUQECItem(BaseModel):

    component_type: Literal[
        "LRU",
        "QEC"
    ] = Field(
        ...,
        description="Indicates whether the item is an LRU or QEC component."
    )

    component_description: str = Field(
        ...,
        description="Description of the LRU / QEC item (e.g., Main Fuel Pump, IDG, VBV Actuator)."
    )

    position: Optional[str] = Field(
        None,
        description="Installation position (L/H, R/H, Upper, Lower), if applicable."
    )

    part_number: Optional[str] = Field(
        None,
        description="Installed part number."
    )

    serial_number: Optional[str] = Field(
        None,
        description="Serial number of the item, if serialized."
    )

    ipc_reference: Optional[str] = Field(
        None,
        description="IPC chapter / figure / item reference."
    )

    quantity: Optional[int] = Field(
        None,
        description="Quantity of this item required or installed."
    )

    installation_status: Literal[
        "INSTALLED",
        "NOT_INSTALLED",
        "NOT_SUPPLIED",
        "NOT_APPLICABLE"
    ] = Field(
        ...,
        description="Installation status of the item."
    )

    source_engine_reference: Optional[str] = Field(
        None,
        description="Source engine ESN if the item was transferred from another engine."
    )

    remarks: Optional[str] = Field(
        None,
        description="Remarks such as 'Original Engine Delivery', 'From Engine ESN XXXX', 'NR', 'NSN'."
    )


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class LRUQECStatement_listData(BaseModel):
    header: LRUQECStatementHeader
    components: List[LRUQECItem]

class LLPStatusStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the LLP status summary was issued. "
            "If not explicitly stated, use the 'as of' date."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, lessor, or organization issuing the LLP status document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Reference period for LLP status "
            "(e.g., 'As of 03-Jun-2021', 'At shop visit', 'At lease return')."
        )
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model to which the LLP status applies (e.g., CFM56-5B6/P, CFM56-7B24)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    total_time_since_new: Optional[str] = Field(
        None,
        description="Total engine Time Since New (TSN) at the reference date."
    )

    total_cycles_since_new: Optional[str] = Field(
        None,
        description="Total engine Cycles Since New (CSN) at the reference date."
    )

    thrust_category: Optional[str] = Field(
        None,
        description="Declared thrust category used for LLP life calculation (e.g., 22K, 24K, 26K)."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the certifying engineer or authorized signatory."
    )


# -----------------------------
# LLP Component Item
# -----------------------------
class LLPComponentItem(BaseModel):

    component_type: Literal[
        "LLP"
    ] = Field(
        "LLP",
        description="Component category indicating Life Limited Part."
    )

    component_description: str = Field(
        ...,
        description="Description of the LLP (e.g., Fan Disk, HPT Rotor Disk, LPT Shaft)."
    )

    position: Optional[str] = Field(
        None,
        description="Stage or position of the LLP (e.g., STG 1, STG 4-9, Front, Rear)."
    )

    part_number: Optional[str] = Field(
        None,
        description="Part number of the LLP."
    )

    serial_number: Optional[str] = Field(
        None,
        description="Serial number of the LLP."
    )

    total_cycles: Optional[str] = Field(
        None,
        description="Total cycles accumulated by the LLP."
    )

    life_limit_cycles: Optional[str] = Field(
        None,
        description="Certified life limit in cycles for the LLP."
    )

    cycles_remaining: Optional[str] = Field(
        None,
        description="Remaining cycles available before life limit is reached."
    )

    thrust_category_applied: Optional[str] = Field(
        None,
        description="Thrust category used for calculating the remaining life."
    )

    life_status: Optional[Literal[
        "ACTIVE",
        "NO_LIMIT",
        "LIFE_EXPIRED"
    ]] = Field(
        None,
        description="Derived LLP life status.  "
    )

    remarks: Optional[str] = Field(
        None,
        description="Remarks such as AD notes, inspection requirements, or calculation references."
    )


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class LLPStatusStatement_listData(BaseModel):
    header: LLPStatusStatementHeader
    components: List[LLPComponentItem]

class LDNDStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the LDND status document was issued or the 'as of' date "
            "used for the maintenance status."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, airline, or organization issuing the LDND document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Reference period for the LDND status "
            "(e.g., 'As of 01-Dec-2021', 'At lease return', 'At shop visit')."
        )
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model covered by the LDND status (e.g., CFM56-7B24, CFM56-5B3/P)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    engine_tsn: Optional[str] = Field(
        None,
        description="Engine Time Since New (TSN) at the LDND reference date."
    )

    engine_csn: Optional[str] = Field(
        None,
        description="Engine Cycles Since New (CSN) at the LDND reference date."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory approving the LDND status."
    )


# -----------------------------
# LDND Component / Task Item
# -----------------------------
class LDNDComponentItem(BaseModel):

    component_type: Literal[
        "ENGINE_TASK",
        "MODULE_TASK",
        "SYSTEM_TASK"
    ] = Field(
        ...,
        description="Category of the LDND item."
    )

    position: Optional[str] = Field(
        None,
        description="Engine position if applicable (LH, RH, ENG #1, ENG #2)."
    )

    model_type: Optional[str] = Field(
        None,
        description="Applicable engine or module model if stated."
    )

    task_reference: Optional[str] = Field(
        None,
        description="Task card number, MPD reference, or maintenance program reference."
    )

    task_description: Optional[str] = Field(
        None,
        description="Description of the maintenance task."
    )

    last_done_date: Optional[str] = Field(
        None,
        description="Date when the task was last accomplished."
    )

    last_done_tsn: Optional[str] = Field(
        None,
        description="Engine TSN at last accomplishment."
    )

    last_done_csn: Optional[str] = Field(
        None,
        description="Engine CSN at last accomplishment."
    )

    next_due_date: Optional[str] = Field(
        None,
        description="Calendar date when the task is next due, if applicable."
    )

    next_due_tsn: Optional[str] = Field(
        None,
        description="Engine TSN at which the task is next due."
    )

    next_due_csn: Optional[str] = Field(
        None,
        description="Engine CSN at which the task is next due."
    )

    remaining_interval: Optional[str] = Field(
        None,
        description="Remaining time, cycles, or days until the task becomes due."
    )

    
    


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class LDNDStatement_listData(BaseModel):
    header: LDNDStatementHeader
    components: List[LDNDComponentItem]

class LDNDStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the LDND status document was issued or the 'as of' date "
            "used for the maintenance status."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, airline, or organization issuing the LDND document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Reference period for the LDND status "
            "(e.g., 'As of 01-Dec-2021', 'At lease return', 'At shop visit')."
        )
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model covered by the LDND status (e.g., CFM56-7B24, CFM56-5B3/P)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    engine_tsn: Optional[str] = Field(
        None,
        description="Engine Time Since New (TSN) at the LDND reference date."
    )

    engine_csn: Optional[str] = Field(
        None,
        description="Engine Cycles Since New (CSN) at the LDND reference date."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory approving the LDND status."
    )


# -----------------------------
# LDND Component / Task Item
# -----------------------------
class LDNDComponentItem(BaseModel):

    component_type: Literal[
        "ENGINE_TASK",
        "MODULE_TASK",
        "SYSTEM_TASK"
    ] = Field(
        ...,
        description="Category of the LDND item."
    )

    position: Optional[str] = Field(
        None,
        description="Engine position if applicable (LH, RH, ENG #1, ENG #2)."
    )

    model_type: Optional[str] = Field(
        None,
        description="Applicable engine or module model if stated."
    )

    task_reference: Optional[str] = Field(
        None,
        description="Task card number, MPD reference, or maintenance program reference."
    )

    task_description: Optional[str] = Field(
        None,
        description="Description of the maintenance task."
    )

    last_done_date: Optional[str] = Field(
        None,
        description="Date when the task was last accomplished."
    )

    last_done_tsn: Optional[str] = Field(
        None,
        description="Engine TSN at last accomplishment."
    )

    last_done_csn: Optional[str] = Field(
        None,
        description="Engine CSN at last accomplishment."
    )

    next_due_date: Optional[str] = Field(
        None,
        description="Calendar date when the task is next due, if applicable."
    )

    next_due_tsn: Optional[str] = Field(
        None,
        description="Engine TSN at which the task is next due."
    )

    next_due_csn: Optional[str] = Field(
        None,
        description="Engine CSN at which the task is next due."
    )

    remaining_interval: Optional[str] = Field(
        None,
        description="Remaining time, cycles, or days until the task becomes due."
    )

    
    


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class LDNDStatement_listData(BaseModel):
    header: LDNDStatementHeader
    components: List[LDNDComponentItem]

class InstallRemovalStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the install/removal history document was issued "
            "or the 'as of' date of the record."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, airline, or organization issuing the install/removal log."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Overall period covered by the install/removal history "
            "(e.g., '2003 to 2018', 'During lease period')."
        )
    )

    aircraft_registration: Optional[str] = Field(
        None,
        description="Aircraft registration if stated."
    )

    aircraft_model: Optional[str] = Field(
        None,
        description="Aircraft model if stated (e.g., A320-214, B737-300)."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory approving the logbook."
    )


# -----------------------------
# Install / Removal Component Item
# -----------------------------
class InstallRemovalComponentItem(BaseModel):

    component_type: Literal[
        "ENGINE",
        "APU",
        "MODULE",
        "MAJOR_COMPONENT"
    ] = Field(
        ...,
        description="Category of the installed or removed component."
    )

    action_type: Literal[
        "INSTALLED",
        "REMOVED"
    ] = Field(
        ...,
        description="Indicates whether the record refers to an installation or a removal."
    )

    position: Optional[str] = Field(
        None,
        description="Installation position (LH, RH, ENG #1, ENG #2), if applicable."
    )

    model_type: Optional[str] = Field(
        None,
        description="Component model (e.g., CFM56-3C1, CFM56-7B22)."
    )

    serial_number: Optional[str] = Field(
        None,
        description="Component serial number (ESN, APU SN, module SN)."
    )

    aircraft_registration: Optional[str] = Field(
        None,
        description="Aircraft registration at time of install/removal."
    )

    aircraft_msn: Optional[str] = Field(
        None,
        description="Aircraft MSN if stated."
    )

    event_date: Optional[str] = Field(
        None,
        description="Date of installation or removal."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Component TSN at the time of install or removal."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Component CSN at the time of install or removal."
    )

    aircraft_time_at_event: Optional[str] = Field(
        None,
        description="Aircraft total hours at the time of the event, if stated."
    )

    aircraft_cycles_at_event: Optional[str] = Field(
        None,
        description="Aircraft total cycles at the time of the event, if stated."
    )

    removal_reason: Optional[str] = Field(
        None,
        description="Reason for removal (e.g., LLP expired, scheduled shop visit, damage)."
    )

    


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class InstallRemovalStatement_listData(BaseModel):
    header: InstallRemovalStatementHeader
    components: List[InstallRemovalComponentItem]

# -----------------------------
# Header – AD Status
# -----------------------------
class ADStatusStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the AD status document was issued or the 'as of' date "
            "for AD compliance status."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, airline, CAMO, or MRO issuing the AD status document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Reference period for AD status "
            "(e.g., 'As of Dec 2024', 'Through FAA/EASA Biweekly 2020-07')."
        )
    )

    aircraft_registration: Optional[str] = Field(
        None,
        description="Aircraft registration if stated."
    )

    aircraft_model: Optional[str] = Field(
        None,
        description="Aircraft model if stated (e.g., A320-214, B737-300)."
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model covered by the AD status (e.g., CFM56-7B, CFM56-5B)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN), if applicable."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory approving the AD status."
    )


# -----------------------------
# AD Component / AD Line Item
# -----------------------------
class ADStatusComponentItem(BaseModel):

    component_type: Literal[
        "ENGINE",
        "APU",
        "AIRFRAME",
        "COMPONENT"
    ] = Field(
        ...,
        description="Component category to which the AD applies."
    )

    ad_number: str = Field(
        ...,
        description="Primary AD number (e.g., FAA AD, EASA AD, DGAC AD)."
    )



    issuing_authority: Optional[Literal[
        "FAA",
        "EASA",
        "DGAC",
        "CAAC",
        "OTHER"
    ]] = Field(
        None,
        description="Authority issuing the AD."
    )

    subject: Optional[str] = Field(
        None,
        description="Subject or title of the Airworthiness Directive."
    )

    affected_part_or_system: Optional[str] = Field(
        None,
        description="Affected system, module, or part (e.g., Fan Disk, AGB, HPT Disk)."
    )

    compliance_status: Literal[
        "COMPLIED",
        "OPEN",
        "NOT_APPLICABLE",
        "SUPERSEDED",
        "CANCELLED"
    ] = Field(
        ...,
        description="Current compliance status of the AD."
    )

    method_of_compliance: Optional[str] = Field(
        None,
        description="Method of compliance (e.g., SB reference, inspection, replacement)."
    )

    compliance_date: Optional[str] = Field(
        None,
        description="Date when the AD was complied with, if applicable."
    )

    next_due: Optional[str] = Field(
        None,
        description="Next due date, TSN, CSN, or condition (e.g., next shop visit)."
    )


    


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class ADStatus_Statement_listData(BaseModel):
    header: ADStatusStatementHeader
    components: List[ADStatusComponentItem]


# Header – Fan Blade Document
# -----------------------------
class FanBladeStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the fan blade distribution / chart / damage map was issued "
            "or last updated."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, MRO, or organization issuing the fan blade document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Reference period or event (e.g., at shop visit, at engine delivery, "
            "post inspection)."
        )
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model (e.g., CFM56-3, CFM56-5B, CFM56-7B)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of authorized signatory or certifying staff."
    )


# -----------------------------
# Fan Blade Component Item
# -----------------------------
class FanBladeComponentItem(BaseModel):

    component_type: str = Field(
        "FAN_BLADE",
        description="Component category indicating fan blade."
    )

    position: Optional[str] = Field(
        None,
        description="Blade position number (e.g., 1–24, 1–38)."
    )

    model_type: Optional[str] = Field(
        None,
        description="Fan blade model or engine variant if stated."
    )

    part_number: Optional[str] = Field(
        None,
        description="Fan blade part number."
    )

    serial_number: Optional[str] = Field(
        None,
        description="Fan blade serial number."
    )

    moment_weight: Optional[str] = Field(
        None,
        description="Blade moment weight used for balance (as stated)."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Blade TSN if stated (often UNK in fan blade charts)."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Blade CSN if stated (often UNK in fan blade charts)."
    )

    damage_present: Optional[bool] = Field(
        None,
        description="Indicates whether damage was noted on the blade."
    )

    repair_status: Optional[str] = Field(
        None,
        description="Repair or disposition status (e.g., blended, within limits, no action required)."
    )

    remarks: Optional[str] = Field(
        None,
        description="Additional remarks such as SB reference, AMM task, or inspection notes."
    )


# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class FanBladeStatement_listData(BaseModel):
    header: FanBladeStatementHeader
    components: List[FanBladeComponentItem]



# -----------------------------
# Header – HPT Blade Document
# -----------------------------
class HPTBladeStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the HPT blade list / traceability / configuration document "
            "was issued or last updated."
        )
    )

    operator_name: str = Field(
        ...,
        description="Operator, MRO, or organization issuing the HPT blade document."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Reference period or condition "
            "(e.g., at shop visit, as at specific date, post installation)."
        )
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model (e.g., CFM56-7B27, CFM56-3C1)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of authorized signatory or certifying engineer."
    )


# -----------------------------
# HPT Blade Component Item
# -----------------------------
class HPTBladeComponentItem(BaseModel):

    component_type: str = Field(
        "HPT_BLADE",
        description="Component category indicating HPT blade."
    )

    position: Optional[str] = Field(
        None,
        description="Blade position number if stated (e.g., 1–80)."
    )

    model_type: Optional[str] = Field(
        None,
        description="Blade model or engine variant reference."
    )

    part_number: Optional[str] = Field(
        None,
        description="HPT blade part number (e.g., 2100M96P04, 2100M96P05)."
    )

    serial_number: Optional[str] = Field(
        None,
        description="HPT blade serial number."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Blade TSN (often engine TSN at installation)."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Blade CSN (often engine CSN at installation)."
    )

    time_since_overhaul_tso: Optional[str] = Field(
        None,
        description="Time Since Overhaul (TSO) if stated."
    )

    cycles_since_overhaul_cso: Optional[str] = Field(
        None,
        description="Cycles Since Overhaul (CSO) if stated."
    )






# -----------------------------
# Root Object (Same Pattern)
# -----------------------------
class HPTBladeStatement_listData(BaseModel):
    header: HPTBladeStatementHeader
    components: List[HPTBladeComponentItem]



class SBStatusStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description=(
            "Date the SB status document was issued or the 'as of' date "
            "for SB compliance status."
        )
    )

    operator_name: Optional[str] = Field(
        None,
        description="Operator, airline, CAMO, MRO, or organization issuing the SB status."
    )

    operating_period: Optional[str] = Field(
        None,
        description=(
            "Operating or reference period covered by the SB status, "
            "e.g. '11 Feb 2016 to 27 Apr 2016', 'As of Dec 2024'."
        )
    )

    aircraft_registration: Optional[str] = Field(
        None,
        description="Aircraft registration if stated in the document."
    )

    aircraft_model: Optional[str] = Field(
        None,
        description="Aircraft model if stated (e.g., B737-800, A319-111)."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Name of the authorized signatory approving the SB status."
    )

    signed_date: Optional[str] = Field(
        None,
        description="Date of signature or approval, if stated."
    )
class SBStatusComponentItem(BaseModel):

    component_type: Literal[
        "ENGINE",
        "APU",
        "AIRFRAME",
        "LANDING_GEAR",
        "COMPONENT"
    ] = Field(
        ...,
        description="Component category to which the Service Bulletin applies."
    )

    position: Optional[Literal[
        "LH",
        "RH",
        "#1",
        "#2"
    ]] = Field(
        None,
        description="Component position if applicable (LH, RH, Engine #1, Engine #2)."
    )

    component_model: Optional[str] = Field(
        None,
        description="Component model (e.g., CFM56-5B/P, CFM56-7B22, GTCP-131-9A)."
    )

    component_serial_number: Optional[str] = Field(
        None,
        description="Component serial number (ESN, APU S/N, Gear S/N)."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Time Since New (TSN) at time of SB status or compliance."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Cycles Since New (CSN) at time of SB status or compliance."
    )

    sb_number: str = Field(
        ...,
        description="Service Bulletin number (e.g., CFM56-5B-72-0213, 72-0475R1)."
    )

    sb_revision: Optional[str] = Field(
        None,
        description="SB revision level (e.g., Rev.06, R1, R2)."
    )

    sb_title: Optional[str] = Field(
        None,
        description="Service Bulletin title or short description."
    )

    compliance_status: Literal[
        "COMPLIED",
        "COMPLIED_AT_SHOP_VISIT",
        "EMBODIED",
        "OPEN",
        "NOT_APPLICABLE",
        "SUPERSEDED",
        "CANCELLED"
    ] = Field(
        ...,
        description="Current compliance status of the Service Bulletin."
    )

    compliance_date: Optional[str] = Field(
        None,
        description="Date when the SB was complied with, if applicable."
    )

    compliance_tsn: Optional[str] = Field(
        None,
        description="TSN at which the SB was complied with."
    )

    compliance_csn: Optional[str] = Field(
        None,
        description="CSN at which the SB was complied with."
    )

    next_due: Optional[str] = Field(
        None,
        description=(
            "Next due threshold or condition "
            "(e.g., 'Next shop visit', '55,256 FH', '37,439 FC')."
        )
    )

    
class SBStatus_Statement_listData(BaseModel):
    header: SBStatusStatementHeader
    components: List[SBStatusComponentItem]



class ManufacturerDeliveryHeader(BaseModel):

    
    statement_date: Optional[str] = Field(
        None,
        description="Report date or issue date of the delivery / EDS document."
    )

    manufacturer_name: Optional[str] = Field(
        None,
        description="Manufacturer issuing the document (e.g., CFM International, GE, Pratt & Whitney)."
    )

    operator_name: Optional[str] = Field(
        None,
        description="Initial operator or customer receiving the engine or component."
    )

    aircraft_model: Optional[str] = Field(
        None,
        description="Aircraft model if stated (e.g., B737-800, A320-214)."
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model (e.g., CFM56-7B22, CFM56-7B26)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Engine Time Since New (TSN) at delivery."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Engine Cycles Since New (CSN) at delivery."
    )

    shipping_date: Optional[str] = Field(
        None,
        description="Engine shipping date from manufacturer."
    )

class DeliveryComponentItem(BaseModel):

    component_category: Literal[
        "LLP",
        "QEC"
    ] = Field(
        ...,
        description="Component classification: LLP (Life Limited Part) or QEC (installed engine component). Ignore AD and SB components"
    )

    component_name: str = Field(
        ...,
        description="Component name or nomenclature (e.g., Fan Disk, HPT Rotor Disk, Fuel Nozzle, ECU)."
    )

    part_number: Optional[str] = Field(
        None,
        description="Part Number (PN) of the component."
    )

    serial_number: Optional[str] = Field(
        None,
        description="Serial Number (PSN / SN) of the component."
    )

    position_or_stage: Optional[str] = Field(
        None,
        description="Position, stage, or location (e.g., STG 1, #1, LH, RH)."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Time Since New (TSN) of the component, if stated."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Cycles Since New (CSN) of the component, if stated."
    )

    life_limit_cycles: Optional[str] = Field(
        None,
        description="Life limit in cycles for LLP components, if stated."
    )

class ManufacturerDelivery_listData(BaseModel):
    header: ManufacturerDeliveryHeader
    components: List[DeliveryComponentItem]



class BSIStatementHeader(BaseModel):
    # statement_type intentionally omitted

    statement_date: Optional[str] = Field(
        None,
        description="Date the borescope inspection was performed or report issue date."
    )

    operator_name: Optional[str] = Field(
        None,
        description="Operator, customer, airline, CAMO, or MRO requesting the inspection."
    )

    inspection_provider: Optional[str] = Field(
        None,
        description="Organization performing the borescope inspection (e.g., MTU, APMS, Aeroresponse)."
    )

    inspection_location: Optional[str] = Field(
        None,
        description="Location where the borescope inspection was performed."
    )

    aircraft_model: Optional[str] = Field(
        None,
        description="Aircraft model if stated (e.g., B737-300, B737-400)."
    )

    aircraft_registration: Optional[str] = Field(
        None,
        description="Aircraft registration if stated."
    )

    engine_model: Optional[str] = Field(
        None,
        description="Engine model inspected (e.g., CFM56-3C1, CFM56-7B)."
    )

    engine_serial_number: Optional[str] = Field(
        None,
        description="Engine Serial Number (ESN)."
    )

    engine_position: Optional[str] = Field(
        None,
        description="Engine position (LH, RH, No.1, No.2, Off Wing)."
    )

    time_since_new_tsn: Optional[str] = Field(
        None,
        description="Engine Time Since New (TSN) at time of inspection."
    )

    cycles_since_new_csn: Optional[str] = Field(
        None,
        description="Engine Cycles Since New (CSN) at time of inspection."
    )

    inspection_reason: Optional[str] = Field(
        None,
        description="Reason for borescope inspection (Routine, Acceptance, Hot Section, Customer Request)."
    )

    manual_reference: Optional[str] = Field(
        None,
        description="Maintenance manual or AMM reference used for inspection (e.g., AMM 72-00-00)."
    )

    overall_engine_condition: Optional[Literal[
        "SERVICEABLE",
        "SERVICEABLE_WITH_REMARKS",
        "UNSERVICEABLE"
    ]] = Field(
        None,
        description="Overall engine serviceability conclusion."
    )

    signed_by: Optional[str] = Field(
        None,
        description="Inspector or authorized signatory name."
    )

class BSIComponentItem(BaseModel):

    module: Literal[
        "FAN",
        "BOOSTER",
        "LPC",
        "HPC",
        "COMBUSTOR",
        "HPT",
        "LPT",
        "EXHAUST",
        "OTHER"
    ] = Field(
        ...,
        description="Engine module inspected."
    )

    component_name: str = Field(
        ...,
        description="Component inspected (e.g., HPC Stage 5, Combustor Inner Liner, HPT Blades)."
    )

    stage: Optional[str] = Field(
        None,
        description="Stage number if applicable (e.g., Stage 1, Stage 5, Stg.1)."
    )

    area_or_orientation: Optional[Literal[
        "LE",
        "TE",
        "NGV",
        "VANE",
        "BLADE",
        "ROTOR",
        "SHROUD",
        "LINER",
        "DOME",
        "INNER",
        "OUTER"
    ]] = Field(
        None,
        description="Specific inspection area or orientation."
    )

    inspected: Optional[bool] = Field(
        None,
        description="Whether the component was inspected."
    )

    findings_present: Optional[bool] = Field(
        None,
        description="Whether any findings or discrepancies were observed."
    )

    findings_description: Optional[str] = Field(
        None,
        description="Narrative description of findings (cracks, erosion, deposits, nicks, blends, coating loss)."
    )

    amm_limit_status: Optional[Literal[
        "WITHIN_LIMITS",
        "AT_LIMIT",
        "BEYOND_LIMITS"
    ]] = Field(
        None,
        description="Whether findings are within AMM limits."
    )

    serviceability: Optional[Literal[
        "SERVICEABLE",
        "SERVICEABLE_WITH_MONITORING",
        "UNSERVICEABLE",
        "NOT_APPLICABLE"
    ]] = Field(
        None,
        description="Serviceability status of the inspected component."
    )

    corrective_action_or_note: Optional[str] = Field(
        None,
        description="Corrective action, follow-up requirement, or inspector note."
    )
class BSI_Report_listData(BaseModel):
    header: BSIStatementHeader
    components: List[BSIComponentItem]

class Hours_Cycles_StatementHeader(BaseModel):
    #statement_type: str = Field(..., description="Type of statement (Non-Incident, Non-Accident, Clearance).")

    statement_date: str = Field(None, description="Date the statement was issued.if not found, It is the last date of Period during which the aircraft or component was operated")

    operator_name: str = Field(..., description="Operator or organization issuing the statement.")
    
    operating_period: str = Field(None,description=(
            "Period during which the aircraft or component was operated, "
            "e.g. '17 Nov 2013 to 06 May 2020'."
        )
    )

    signed_by: Optional[str] = Field(None, description="Name of the signatory.")   

class ComponentItem(BaseModel):
    component_type: str = Field(..., description="Component category (Engine, APU, Landing Gear, Airframe).")

    position: Optional[str] = Field(None, description="Component position (LH, RH, #1, #2), if applicable.")

    model_type: Optional[str] = Field(None, description="Component model (e.g., CFM56-7B22, GTCP-131-9B).")

    serial_number: Optional[str] = Field(None, description="Serial number (ESN, APU SN, Gear SN).")

    time_since_new_tsn: Optional[str] = Field(None, description="Time Since New (TSN).")

    cycles_since_new_csn: Optional[str] = Field(None, description="Cycles Since New (CSN).")  

class Hours_Cycles_Statement_listData(BaseModel):
    header: Hours_Cycles_StatementHeader
    components: List[ComponentItem]

Total_schema_list = [ADStatus_Statement_listData,ARC_Statement_listData,BSI_Report_listData,
                     ETOPS_Statement_listData,NonExceedance_Statement_listData,FanBladeStatement_listData,
                     Hours_Cycles_Statement_listData,HPTBladeStatement_listData,InstallRemovalStatement_listData,
                     LDNDStatement_listData,LLPStatusStatement_listData,ManufacturerDelivery_listData,
                     IncidentAccidentStatement_listData,Oilfuelused_Statement_listData,PMADER_Statement_listData,
                     Preservation_Statement_listData,LRUQECStatement_listData,SBStatus_Statement_listData,
                     ThrustRating_Statement_listData,Commercial_Statement_listData]