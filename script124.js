angular
    .module('webApp')
    .controller('indexEsController', ['$scope', '$location', '$window', '$uibModal', 'session', 'SITE', 'escribanos', indexEsController]);

function indexEsController($scope, $location, $window, $uibModal, session, SITE, escribanos) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Para confirmar la solicitud es necesario validar tu cuenta de email.');

    session.clear();

    vm.solicitud = new Solicitud();
    vm.colegio = {};
    vm.colegios = [];

    vm.$onInit = function () {
        escribanos.colegios(function (data) {
            vm.colegios = data;
        });
    };   

    //ENVIAR CODIGO + CAPTCHA
    vm.enviarCodigo = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            //RE CAPTCHA CALLBACK
            recaptchaCallback = function (token) {

                vm.solicitud.solicitante = new Solicitante();
                vm.solicitud.solicitante.esEscribano = true;
                vm.solicitud.solicitante.cuit = vm.cuit;
                vm.solicitud.solicitante.email = vm.email;

                escribanos.save({ RecaptchaResponse: token, Email: vm.solicitud.solicitante.email, Cuit: vm.solicitud.solicitante.cuit, codigo: vm.colegio.codigo },
                    function (data) {
                        grecaptcha.reset();
                        vm.solicitud.codigoEmail = data.codigo;
                        $uibModal.open({
                            animation: true,
                            templateUrl: 'app/modules/mandatario/modalEmailEnviado.html',
                            controller: ['$scope', '$uibModalInstance', function ($modalscope, $uibModalInstance) {
                                var vmModal = this;
                                vmModal.solicitud = vm.solicitud;
                                vmModal.submit = function () {
                                    grecaptcha.reset();
                                    vmModal.formErrors = [];
                                    vmModal.form.codigo.$setValidity('codigoInvalido', vmModal.solicitud.codigoEmail && vmModal.codigo && vmModal.solicitud.codigoEmail.toLowerCase() === vmModal.codigo.toLowerCase());
                                    $modalscope.$broadcast('show-errors-check-validity', 'form');
                                    if (vmModal.form.$valid) {
                                        $uibModalInstance.dismiss('cancel');

                                        vmModal.solicitud.emailValido = true;

                                        //CODIGO 08D MANDATARIOS
                                        //vmModal.solicitud.solicitante.nombre = data.nombre;
                                        //vmModal.solicitud.solicitante.apellido = data.apellido;
                                        //vmModal.solicitud.solicitante.nroMatriculaMandatario = data.nroMatriculaMandatario;
                                        //vmModal.solicitud.solicitante.tipoDocumento = data.tipoDocumento;
                                        //vmModal.solicitud.solicitante.numeroDocumento = data.numeroDocumento;
                                        
                                        
                                        //FIN-CODIGO 08D MANDATARIOS
                                        
                                        //CODIGO SITE 2
                                      

                                        var tramite = new Tramite08();
                                        tramite.AmbasPartes = true;
                                        tramite.esEscribano = true;
                                        //tramite.esMandatario = vm.solicitud.solicitante.esMandatario;
                                        tramite.nroMatricula = data.nroMatricula;
                                        tramite.escribanoCuit = vm.solicitud.solicitante.cuit;
                                        tramite.escribanoNombre = data.nombre;
                                        tramite.escribanoApellido = data.apellido;
                                        tramite.escribanoEmail = data.email;
                                        tramite.escribanoColegio = data.colegio;
                                        tramite.mostrarDetalle = true; 
                                        session.add(tramite);


                                        vmModal.solicitud.clearEscribano();
                                        vmModal.solicitud.esEscribano = true;
                                        vmModal.solicitud.escribanoNombre = data.nombre;
                                        vmModal.solicitud.escribanoApellido = data.apellido;
                                        vmModal.solicitud.escribanoMatricula = data.nroMatricula;
                                        vmModal.solicitud.escribanoCuit = vm.cuit;
                                        vmModal.solicitud.escribanoEmail = vm.email;
                                        vmModal.solicitud.escribanoColegio = data.colegio;
                                        session.add(vmModal);

                                        //END-CODIGO SITE 2
                                        
                                        session.add(vmModal.solicitud);

                                        $location.path('/escribanias/tablero');
                                    }
                                };
                                vmModal.cerrar = function () {
                                    $uibModalInstance.dismiss('cancel');
                                };
                            }],
                            controllerAs: 'modalEmailEnviadoCtrl',
                            backdrop: 'static'
                        });
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            ////RE CAPTCHA CALLBACK
            grecaptcha.execute();
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
    vm.$onInit();
}