export class LengthUnit {
    value: number

    /**
        * @abstract
    */
    static shorthand: string = "units"

    /**
        * @abstract
    */
    static longname: string = "units"

    constructor(value: number) {
        this.value = value
    }

    static fromUnitName(name: string): typeof LengthUnit {
        let convTable: { [key: string]: typeof LengthUnit } = {}
        for (let unit of Object.values(Units)) {
            convTable[unit.shorthand] = unit
            convTable[unit.longname] = unit
        }
        return Reflect.get(convTable, name, convTable) ?? Yard
    }

    static fromUnitRepr(repr: `${number}${string}`) {
        let numberPart = parseFloat(repr)
        let unitPart = repr.slice(String(numberPart).length)
        // let numberPart = ""
        // let unitPart = ""
        // for (let ch of repr) {
        //     if (!"0123456789".includes(ch)) {
        //         unitPart += ch
        //     }
        //     else {
        //         numberPart += ch
        //     }
        // }
        return new (this.fromUnitName(unitPart))(Number(numberPart))
    }

    toString(){
        return `${this.value}${this.getShorthand()}`
    }

    /**
        * @abstract
    */
    yards(): number {
        return 0
    }

    toUnit(cls: typeof LengthUnit) {
        let inYards = this.yards()
        let amountOfUnitsInYards = (new cls(1)).yards()
        return new cls(inYards / amountOfUnitsInYards)
    }

    getShorthand(){
        //@ts-ignore
        return this.constructor.shorthand
    }
}

class AstronomicalUnit extends LengthUnit {
    static longname = 'astronomicalunit'
    static shorthand = 'AU'
    yards() {
        return this.value * 92955807.267433 * 1760
    }
}

class Mile extends LengthUnit {
    static longname = "mile"
    static shorthand = "mi"
    yards() {
        return this.value * 1760
    }
}

class Yard extends LengthUnit {
    static longname = "yard"
    static shorthand = "yd"
    yards() {
        return this.value
    }
}

class Foot extends LengthUnit {
    static longname = "foot"
    static shorthand = "ft"
    yards() {
        return this.value / 3
    }
}

class MetricFoot extends LengthUnit {
    static longname = 'metricfoot'
    static shorthand = 'metricft'
    yards() {
        return (new Inch(11.811)).toUnit(Foot).value / 3
    }
}

class Inch extends LengthUnit {
    static longname = "inch"
    static shorthand = "in"
    yards() {
        return this.value / 3 / 12
    }
}

class Kilometer extends LengthUnit {
    static longname = 'kilometer'
    static shorthand = 'km'
    yards() {
        return (new Meter(this.value * 1000)).yards()
    }
}

class Hectometer extends LengthUnit {
    static longname = 'hectometer'
    static shorthand = 'hm'
    yards() {
        return (new Meter(this.value * 100)).yards()
    }
}


class Dekameter extends LengthUnit {
    static longname = 'dekameter'
    static shorthand = 'dam'
    yards() {
        return (new Meter(this.value * 10)).yards()
    }
}

class Meter extends LengthUnit {
    static longname = 'meter'
    static shorthand = 'm'
    yards() {
        return (new Centimeter(this.value * 100)).yards()
    }
}

class Decimeter extends LengthUnit {
    static longname = 'decimeter'
    static shorthand = 'dm'
    yards() {
        return (new Centimeter(this.value * 10)).yards()
    }
}

class Centimeter extends LengthUnit {
    static longname = "centimeter"
    static shorthand = "cm"
    yards() {
        return this.value / 2.54 / 36
    }
}

class Millimeter extends LengthUnit {
    static longname = 'millimeter'
    static shorthand = 'mm'
    yards() {
        return (this.value / 10) / 2.54 / 36
    }
}

class Micrometer extends LengthUnit {
    static longname = 'micrometer'
    static shorthand = 'µm'
    yards() {
        return (this.value / 100) / 2.54 / 36
    }
}

class Nanometer extends LengthUnit {
    static longname = 'nanometer'
    static shortname = 'nm'
    yards() {
        return (this.value / 1000) / 2.54 / 36
    }
}

class Horse extends LengthUnit {
    static longname = 'horse'
    static shorthand = 'horse'
    yards() {
        return (new Foot(this.value * 8)).yards()
    }
}

class Hand extends LengthUnit {
    static longname = "hand"
    static shorthand = "hand"

    yards() {
        return (new Inch(this.value * 4)).yards()
    }
}

class ValveSourceHammer extends LengthUnit {
    static longname = "ValveSourcehammer"
    static shorthand = "VShammer"
    yards() {
        return this.value / 3 / 16
    }
}

class Mickey extends LengthUnit {
    static longname = 'Mickey'
    static shorthand = 'Mickey'
    yards() {
        return this.value / 16000 / 36
    }
}

class Smoot extends LengthUnit {
    static longname = 'Smoot'
    static shorthand = 'Smoot'
    yards() {
        return (new Centimeter(170)).yards()
    }
}

class Footballfield extends LengthUnit {
    static longname = 'footballfield'
    static shorthand = 'footballfield'
    yards() {
        return this.value * 100
    }
}

class Minecraftblock extends LengthUnit {
    static longname = 'Minecraftblock'
    static shorthand = 'MCblock'
    yards() {
        return (new Meter(this.value * 100)).yards()
    }
}


class Lightyear extends LengthUnit {
    static longname = 'lightyear'
    static shorthand = 'lighty'
    yards() {
        return (new AstronomicalUnit(this.value * 63241.08)).yards()
    }
}

class Lightmonth extends LengthUnit {
    static longname = 'lightmonth'
    static shorthand = 'lightm'
    yards() {
        return (new Lightyear(this.value / 12.175)).yards()
    }
}

class Lightweek extends LengthUnit {
    static longname = 'lightweek'
    static shorthand = 'lightw'
    yards() {
        return (new Lightmonth(this.value * .233333333333333333333333)).yards()
    }
}

class Lightday extends LengthUnit {
    static longname = 'lightday'
    static shorthand = 'lightd'
    yards() {
        return (new Lightweek(this.value / 7)).yards()
    }
}

class Lighthour extends LengthUnit {
    static longname = 'lighthour'
    static shorthand = 'lightH'
    yards() {
        return (new Lightday(this.value / 24)).yards()
    }
}

class Lightminute extends LengthUnit {
    static longname = 'lightminute'
    static shorthand = 'lightM'
    yards() {
        return (new Lighthour(this.value / 60)).yards()
    }
}

class Lightsecond extends LengthUnit {
    static longname = 'lightsecond'
    static shorthand = 'lightS'
    yards() {
        return (new Lightminute(this.value / 60)).yards()
    }
}

const Units = {
    LengthUnit,
    AstronomicalUnit,
    Mile,
    Yard,
    Foot,
    Inch,
    Hand,
    ValveSourceHammer,
    MetricFoot,
    Centimeter,
    Millimeter,
    Micrometer,
    Nanometer,
    Meter,
    Kilometer,
    Decimeter,
    Dekameter,
    Hectometer,
    Horse,
    Mickey,
    Smoot,
    Footballfield,
    Minecraftblock,
    Lightmonth,
    Lightyear,
    Lightweek,
    Lightday,
    Lighthour,
    Lightminute,
    Lightsecond
}

export default {
    ...Units
}
