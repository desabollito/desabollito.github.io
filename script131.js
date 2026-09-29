angular
    .module('webApp')
    .controller('estimadorController', ['$scope', '$location', '$window', '$routeParams', 'appConfig', 'session', 'Estimador', estimadorController]);

function estimadorController($scope, $location, $window, $routeParams, appConfig, session, Estimador) {
    $window.scrollTo(0, 0);

    var vm = this;

    vm.incluirImpuestos = "1";
    vm.es08D = "0";

    //TEST
    //vm.certificadoInscripcionNumero = '041-000233817/2016';
    //vm.numeroChasis = 'J486405';
    //vm.valorDeclarado = 1000000;
    //vm.codigoProvincia = 'B';
    //vm.dominio = 'AA190PO';
    //END:TEST

    session.clear();

    vm.provincias = provincias;
    vm.tiposTramites = tiposTramiteEstimador;

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                Estimador.estimar(
                    {
                        RecaptchaResponse: token,
                        CodigoTramite: vm.codigoTramite,
                        CertificadoInscripcionNumero: vm.certificadoInscripcionNumero,
                        NumeroChasis: vm.numeroChasis,
                        ValorDeclarado: vm.valorDeclarado,
                        CodigoProvincia: vm.codigoProvincia,
                        CodigoVehiculo: vm.vehiculos,
                        Dominio: vm.dominio,
                        IncluirImpuestos: vm.incluirImpuestos && vm.incluirImpuestos === "0",  // "1"
                        Es08D: vm.es08D && vm.es08D === "1"
                    },
                    function (data) {
                        grecaptcha.reset();

                        var solicitud = new Solicitud();
                        solicitud.codigoTramite = data.CodigoTramite;
                        solicitud.nombreTramite = data.NombreTramite;
                        solicitud.codigoVehiculo = data.Vehiculo;
                        solicitud.codigoProvincia = vm.codigoProvincia;
                        solicitud.precarga = new Precarga();
                        solicitud.precarga.valorDeclarado = vm.valorDeclarado;
                        solicitud.precarga.certificadoInscripcionNumero = vm.certificadoInscripcionNumero;
                        solicitud.precarga.numeroChasis = vm.numeroChasis;
                        solicitud.presupuesto = data.Presupuesto;
                        if (data.Certificado) {
                            solicitud.vehiculoMarca = data.Certificado.Marca;
                            solicitud.vehiculoModelo = data.Certificado.Modelo;
                            solicitud.vehiculoTipo = data.Certificado.Tipo;
                            solicitud.vehiculoAnio = data.Certificado.Anio;
                            solicitud.vehiculoOrigen = data.Certificado.Origen;
                            solicitud.vehiculoValorTabla = data.Certificado.ValorTabla;
                        }
                        if (data.Transferencia) {
                            solicitud.vehiculoMarca = data.Transferencia.Marca;
                            solicitud.vehiculoModelo = data.Transferencia.Modelo;
                            solicitud.vehiculoTipo = data.Transferencia.Tipo;
                            solicitud.vehiculoAnio = data.Transferencia.Anio;
                            solicitud.vehiculoOrigen = data.Transferencia.Origen;
                            solicitud.vehiculoValorTabla = data.Transferencia.ValorTabla;
                        }
                        session.add(solicitud);

                        $location.path('/estimador/presupuesto');
                        return;
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}