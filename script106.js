angular
    .module('webApp')
    .controller('turno08DController', ['$rootScope', '$scope', '$location', '$filter', 'session', 'turno', turno08DController]);

function turno08DController($rootScope, $scope, $location, $filter, session, turno) {
    var vm = this;

    tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    } else {
        tramite.turno = null;
        vm.turno = new Turno();
    }

    var formatDateComponent = function (dateComponent) {
        return (dateComponent < 10 ? '0' : '') + dateComponent;
    };

    var formatDate = function (date) {
        return formatDateComponent(date.getDate()) + '/' + formatDateComponent(date.getMonth() + 1) + '/' + date.getFullYear();
    };

    //var date = new Date(), y = date.getFullYear(), m = date.getMonth();
    //var firstDay = new Date(y, m, 1);
    //var lastDay = new Date(y, m + 1, 0);

    vm.onSelectDay = function (dia) {
        $scope.$apply(function () {
            vm.turno.fecha = dia;
            vm.turno.hora = null;
            try {
                vm.horarios = $filter('filter')(vm.dias, { FechaString: dia })[0].Horarios;
            }
            catch (e) { vm.horarios = null; }
        });
    };

    vm.submit = function () {
        tramite.turno = vm.turno;
        session.set(0, tramite);
        $location.path('/compradores/confirmar');
    };

    vm.volver = function () {
    };

    //vm.today = formatDate(new Date());
    //vm.start = formatDate(firstDay);
    //vm.end = formatDate(lastDay);
    //vm.diasnolaborables = [];
    //vm.dias = null;
    var codigors = tramite.CodigoRegistro;
    if (tramite.CodigoTramite === '083001' || tramite.CodigoTramite === '084001')
        codigors = tramite.CodigoRegistroDestino;

    var turnoSol = typeof ($rootScope.claims) === "undefined" || $rootScope.claims === "";
    if (!turnoSol) {
        session.set(0, tramite);
        $location.path('/compradores/confirmar');
    }
    else {

        var cuitSolicita;
        if (tramite.esMandatario) {
            cuitSolicita = tramite.cuitMandatario;
        }
        else {
            if (tramite.Compradores[0].Apoderados.length > 0) {
                cuitSolicita = tramite.Compradores[0].Apoderados[0].CuitCuil;
                
            } else {
                cuitSolicita = tramite.Compradores[0].CuitCuil;
            }
        }


        turno.obtenerTurnos({ registroSeccional: codigors, codigoTramite: tramite.CodigoTramite, esMandatario: tramite.esMandatario, cuitSolicita: cuitSolicita},
            function (data) {
                vm.today = data.hoy;
                vm.start = data.inicio;
                vm.end = data.fin;
                vm.diasnolaborables = data.diasNoLaborables;
                vm.dias = data.dias;

                var a = {
                    today: data.hoy,
                    start: data.inicio,
                    end: data.fin,
                    diasnolaborables: data.diasNoLaborables,
                    dias: data.dias
                }

                vm.control.refresh(a);
            },
            function () {
            });

        try {
            turno.obtenerTurnosEstadistica({ cuitSolicita: tramite.esMandatario ? tramite.cuitMandatario : cuitSolicita },
                function (data) {
                    vm.TurnosOcupados = data.TurnosOcupados;
                    vm.TurnosCancelados = data.TurnosCancelados;
                    vm.TurnosDesistidos = data.TurnosDesistidos;
                    vm.TurnosAusentes = data.TurnosAusentes;
                    vm.TurnosAtendidos = data.TurnosAtendidos;
                    vm.TurnosMandatario = data.TurnosMandatario;
                    vm.TurnosParticular = data.TurnosParticular;

                    vm.mostrarDataTurnos = true;
                },
                function (err) {
                    console.log(errs)
                });
        }
        catch (e) {
            vm.mostrarDataTurnos = false;
        }

    }
}